const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
const port = Number(process.env.PORT || 8080);
const root = __dirname;
const localResponseDir = process.env.LOCAL_RESPONSE_DIR || path.join(root, "data", "responses");
const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const storageContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "survey-responses";
const maxPayloadBytes = 64 * 1024;

app.disable("x-powered-by");
app.use(express.json({ limit: `${maxPayloadBytes}b` }));

class DuplicateSubmissionError extends Error {
  constructor() {
    super("This respondent has already submitted a response.");
    this.name = "DuplicateSubmissionError";
  }
}

function isString(value, maxLength = 1000) {
  return typeof value === "string" && value.length <= maxLength;
}

function validateResponse(payload) {
  if (!payload || typeof payload !== "object") return "Request body must be a JSON object.";
  if (payload.survey !== "global_ai_readiness_survey") return "Invalid survey value.";
  if (!["ja", "en", "zh", "es"].includes(payload.language)) return "Invalid language value.";
  if (!isString(payload.company_code, 80) || !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/i.test(payload.company_code)) return "Invalid company_code value.";
  if (!isString(payload.response_code, 80) || !/^[a-z0-9][a-z0-9-]{3,78}[a-z0-9]$/i.test(payload.response_code)) return "Invalid response_code value.";
  if (!isString(payload.submitted_at, 40) || Number.isNaN(Date.parse(payload.submitted_at))) return "Invalid submitted_at value.";
  if (payload.respondent_id && (!isString(payload.respondent_id, 80) || !/^[0-9a-f-]{36}$/i.test(payload.respondent_id))) return "Invalid respondent_id value.";
  if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) return "answers must be an object.";

  for (let index = 1; index <= 20; index += 1) {
    const id = `q${String(index).padStart(2, "0")}`;
    if (!(id in payload.answers)) return `Missing answer: ${id}.`;
    const value = payload.answers[id];
    if (Array.isArray(value)) {
      if (value.length > 20) return `Too many values: ${id}.`;
      if (!value.every((item) => isString(item, 120))) return `Invalid array value: ${id}.`;
    } else if (!isString(value, id === "q20" ? 300 : 120)) {
      return `Invalid value: ${id}.`;
    }
  }
  return null;
}

function responseCodeHash(payload) {
  return crypto
    .createHash("sha256")
    .update(`${payload.company_code.toLowerCase()}:${payload.response_code.trim().toUpperCase()}`)
    .digest("hex");
}

function createRecord(payload, request) {
  const receivedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  return {
    id,
    received_at: receivedAt,
    company_code: payload.company_code.toLowerCase(),
    response_code_hash: responseCodeHash(payload),
    source: {
      user_agent: request.get("user-agent") || "",
      forwarded_for: request.get("x-forwarded-for") || ""
    },
    response: {
      survey: payload.survey,
      language: payload.language,
      respondent_id: payload.respondent_id || "",
      submitted_at: payload.submitted_at,
      answers: payload.answers
    }
  };
}

function jsonBuffer(record) {
  return Buffer.from(JSON.stringify(record, null, 2), "utf8");
}

function csvBuffer(record) {
  const headers = [
    "response_id",
    "received_at",
    "company_code",
    "response_code_hash",
    "survey",
    "language",
    "submitted_at",
    ...Array.from({ length: 20 }, (_, index) => `q${String(index + 1).padStart(2, "0")}`)
  ];
  const row = [
    record.id,
    record.received_at,
    record.company_code,
    record.response_code_hash,
    record.response.survey,
    record.response.language,
    record.response.submitted_at,
    ...headers.slice(7).map((id) => {
      const value = record.response.answers[id];
      return Array.isArray(value) ? value.join(";") : value;
    })
  ];
  const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return Buffer.from(`${headers.map(escapeCell).join(",")}\r\n${row.map(escapeCell).join(",")}\r\n`, "utf8");
}

function baseResponseName(record) {
  const date = record.received_at.slice(0, 10);
  return `${date}/${record.received_at.replaceAll(":", "-")}_${record.id}`;
}

function responseObjectNames(record) {
  const baseName = baseResponseName(record);
  return {
    json: `json/${baseName}.json`,
    csv: `csv/${baseName}.csv`
  };
}

function respondentMarkerName(record) {
  return `respondents/${record.company_code}/${record.response_code_hash}.json`;
}

function respondentMarkerBuffer(record) {
  return Buffer.from(JSON.stringify({
    company_code: record.company_code,
    response_code_hash: record.response_code_hash,
    response_id: record.id,
    received_at: record.received_at
  }, null, 2), "utf8");
}

async function saveToAzureBlob(record) {
  const credential = new DefaultAzureCredential();
  const blobServiceClient = new BlobServiceClient(
    `https://${storageAccountName}.blob.core.windows.net`,
    credential
  );
  const containerClient = blobServiceClient.getContainerClient(storageContainerName);
  await containerClient.createIfNotExists();
  const names = responseObjectNames(record);
  const markerName = respondentMarkerName(record);
  try {
    await containerClient.getBlockBlobClient(markerName).uploadData(respondentMarkerBuffer(record), {
      blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
      conditions: { ifNoneMatch: "*" }
    });
  } catch (error) {
    if (error.statusCode === 409 || error.statusCode === 412) throw new DuplicateSubmissionError();
    throw error;
  }
  await containerClient.getBlockBlobClient(names.json).uploadData(jsonBuffer(record), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
    metadata: {
      survey: "global_ai_readiness_survey",
      language: record.response.language
    }
  });
  await containerClient.getBlockBlobClient(names.csv).uploadData(csvBuffer(record), {
    blobHTTPHeaders: { blobContentType: "text/csv; charset=utf-8" },
    metadata: {
      survey: "global_ai_readiness_survey",
      language: record.response.language
    }
  });
  return { kind: "azure_blob", container: storageContainerName, json: names.json, csv: names.csv, respondent_marker: markerName };
}

async function saveToLocalFile(record) {
  await fs.mkdir(localResponseDir, { recursive: true });
  const names = responseObjectNames(record);
  const markerPath = path.join(localResponseDir, respondentMarkerName(record).replace(/\//g, "_"));
  const jsonPath = path.join(localResponseDir, names.json.replace(/\//g, "_"));
  const csvPath = path.join(localResponseDir, names.csv.replace(/\//g, "_"));
  try {
    await fs.writeFile(markerPath, respondentMarkerBuffer(record), { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") throw new DuplicateSubmissionError();
    throw error;
  }
  await fs.writeFile(jsonPath, jsonBuffer(record));
  await fs.writeFile(csvPath, csvBuffer(record));
  return { kind: "local_file", json: jsonPath, csv: csvPath, respondent_marker: markerPath };
}

async function saveRecord(record) {
  if (storageAccountName) return saveToAzureBlob(record);
  return saveToLocalFile(record);
}

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    storage: storageAccountName ? "azure_blob" : "local_file"
  });
});

app.post("/api/responses", async (request, response) => {
  const validationError = validateResponse(request.body);
  if (validationError) {
    response.status(400).json({ ok: false, error: validationError });
    return;
  }

  try {
    const record = createRecord(request.body, request);
    const storage = await saveRecord(record);
    response.status(201).json({
      ok: true,
      id: record.id,
      received_at: record.received_at,
      storage
    });
  } catch (error) {
    if (error instanceof DuplicateSubmissionError) {
      response.status(409).json({ ok: false, code: "duplicate_response", error: "This respondent has already submitted a response." });
      return;
    }
    console.error("Failed to save response", error);
    response.status(500).json({ ok: false, error: "Failed to save response." });
  }
});

app.get("/", (_request, response) => {
  response.sendFile(path.join(root, "global_ai_readiness_survey.html"));
});

app.use(express.static(root, {
  extensions: ["html"],
  index: false,
  setHeaders(response, filePath) {
    if (filePath.endsWith(".html")) response.setHeader("Cache-Control", "no-store");
  }
}));

app.listen(port, () => {
  console.log(`Global AI Readiness Survey listening on port ${port}`);
});
