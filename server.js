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
const basicAuthUsername = process.env.BASIC_AUTH_USERNAME || "";
const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD || "";
const maxPayloadBytes = 64 * 1024;

app.disable("x-powered-by");

if ((basicAuthUsername && !basicAuthPassword) || (!basicAuthUsername && basicAuthPassword)) {
  throw new Error("BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be set together.");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicAuth(header) {
  if (!header || !header.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return null;
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
}

function basicAuth(request, response, next) {
  if (!basicAuthUsername && !basicAuthPassword) {
    next();
    return;
  }

  const credentials = parseBasicAuth(request.get("authorization"));
  if (
    credentials
    && safeEqual(credentials.username, basicAuthUsername)
    && safeEqual(credentials.password, basicAuthPassword)
  ) {
    next();
    return;
  }

  response.set("WWW-Authenticate", 'Basic realm="Global AI Readiness Survey", charset="UTF-8"');
  response.status(401).send("Authentication required.");
}

app.use(basicAuth);
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
  if (!["ja", "en", "fr", "es", "pt", "vi", "zh", "ko"].includes(payload.language)) return "Invalid language value.";
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

function responseObjectNames(record) {
  const date = record.received_at.slice(0, 10);
  const baseName = `${record.received_at.replaceAll(":", "-")}_${record.id}`;
  return {
    json: `${date}/json/${baseName}.json`,
    csv: `${date}/csv/${baseName}.csv`
  };
}

function isResponseJsonName(name) {
  return name.endsWith(".json") && (/(^|\/)json\//.test(name) || /^json\//.test(name));
}

function isDuplicateRecord(candidate, record) {
  return candidate
    && candidate.company_code === record.company_code
    && candidate.response_code_hash === record.response_code_hash;
}

async function hasDuplicateInAzureBlob(containerClient, record) {
  for await (const blob of containerClient.listBlobsFlat()) {
    if (!isResponseJsonName(blob.name)) continue;
    const buffer = await containerClient.getBlobClient(blob.name).downloadToBuffer();
    try {
      if (isDuplicateRecord(JSON.parse(buffer.toString("utf8")), record)) return true;
    } catch (_) {
      // Ignore malformed or unrelated JSON files in the container.
    }
  }
  return false;
}

async function collectLocalJsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectLocalJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files;
}

async function hasDuplicateInLocalFiles(record) {
  const files = await collectLocalJsonFiles(localResponseDir);
  for (const file of files) {
    try {
      if (isDuplicateRecord(JSON.parse(await fs.readFile(file, "utf8")), record)) return true;
    } catch (_) {
      // Ignore malformed or unrelated JSON files in the local response directory.
    }
  }
  return false;
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
  if (await hasDuplicateInAzureBlob(containerClient, record)) throw new DuplicateSubmissionError();
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
  return { kind: "azure_blob", container: storageContainerName, json: names.json, csv: names.csv };
}

async function saveToLocalFile(record) {
  await fs.mkdir(localResponseDir, { recursive: true });
  const names = responseObjectNames(record);
  if (await hasDuplicateInLocalFiles(record)) throw new DuplicateSubmissionError();
  const jsonPath = path.join(localResponseDir, ...names.json.split("/"));
  const csvPath = path.join(localResponseDir, ...names.csv.split("/"));
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(csvPath), { recursive: true });
  await fs.writeFile(jsonPath, jsonBuffer(record));
  await fs.writeFile(csvPath, csvBuffer(record));
  return { kind: "local_file", json: jsonPath, csv: csvPath };
}

async function saveRecord(record) {
  if (storageAccountName) return saveToAzureBlob(record);
  return saveToLocalFile(record);
}

async function listAzureRecords() {
  const credential = new DefaultAzureCredential();
  const blobServiceClient = new BlobServiceClient(
    `https://${storageAccountName}.blob.core.windows.net`,
    credential
  );
  const containerClient = blobServiceClient.getContainerClient(storageContainerName);
  const records = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    if (!isResponseJsonName(blob.name)) continue;
    try {
      const buffer = await containerClient.getBlobClient(blob.name).downloadToBuffer();
      records.push(JSON.parse(buffer.toString("utf8")));
    } catch (_) {
      // Ignore malformed or unrelated JSON files in the container.
    }
  }
  return records;
}

async function listLocalRecords() {
  const files = await collectLocalJsonFiles(localResponseDir);
  const records = [];
  for (const file of files) {
    try {
      records.push(JSON.parse(await fs.readFile(file, "utf8")));
    } catch (_) {
      // Ignore malformed or unrelated JSON files in the local response directory.
    }
  }
  return records;
}

async function listRecords() {
  return storageAccountName ? listAzureRecords() : listLocalRecords();
}

function incrementCounter(counter, key) {
  const normalizedKey = String(key || "未回答");
  counter[normalizedKey] = (counter[normalizedKey] || 0) + 1;
}

function sortedCounter(counter) {
  return Object.entries(counter)
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function createEmptyQuestionSummary(id) {
  return {
    id,
    answered: 0,
    blank: 0,
    options: {},
    text_samples: []
  };
}

function buildSummary(records) {
  const summary = {
    generated_at: new Date().toISOString(),
    storage: storageAccountName ? "azure_blob" : "local_file",
    total_responses: records.length,
    first_received_at: "",
    last_received_at: "",
    by_language: {},
    by_company: {},
    by_date: {},
    questions: Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => {
        const id = `q${String(index + 1).padStart(2, "0")}`;
        return [id, createEmptyQuestionSummary(id)];
      })
    )
  };

  const receivedTimes = [];
  for (const record of records) {
    if (!record || !record.response || !record.response.answers) continue;
    incrementCounter(summary.by_language, record.response.language);
    incrementCounter(summary.by_company, record.company_code);
    if (record.received_at) {
      receivedTimes.push(record.received_at);
      incrementCounter(summary.by_date, record.received_at.slice(0, 10));
    }

    for (const [id, questionSummary] of Object.entries(summary.questions)) {
      const value = record.response.answers[id];
      const isBlank = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
      if (isBlank) {
        questionSummary.blank += 1;
        continue;
      }
      questionSummary.answered += 1;
      if (Array.isArray(value)) {
        value.forEach((item) => incrementCounter(questionSummary.options, item));
      } else if (id === "q20") {
        if (questionSummary.text_samples.length < 20) questionSummary.text_samples.push(String(value));
      } else {
        incrementCounter(questionSummary.options, value);
      }
    }
  }

  receivedTimes.sort();
  summary.first_received_at = receivedTimes[0] || "";
  summary.last_received_at = receivedTimes[receivedTimes.length - 1] || "";
  summary.by_language = sortedCounter(summary.by_language);
  summary.by_company = sortedCounter(summary.by_company);
  summary.by_date = sortedCounter(summary.by_date).sort((left, right) => left.label.localeCompare(right.label));
  summary.questions = Object.fromEntries(Object.entries(summary.questions).map(([id, questionSummary]) => [
    id,
    {
      ...questionSummary,
      options: sortedCounter(questionSummary.options)
    }
  ]));
  return summary;
}

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    storage: storageAccountName ? "azure_blob" : "local_file"
  });
});

app.get("/api/admin/summary", async (_request, response) => {
  try {
    response.json({
      ok: true,
      summary: buildSummary(await listRecords())
    });
  } catch (error) {
    console.error("Failed to build summary", error);
    response.status(500).json({ ok: false, error: "Failed to build summary." });
  }
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

app.get("/admin", (_request, response) => {
  response.sendFile(path.join(root, "admin_dashboard.html"));
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
