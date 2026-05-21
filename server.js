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

function isString(value, maxLength = 1000) {
  return typeof value === "string" && value.length <= maxLength;
}

function validateResponse(payload) {
  if (!payload || typeof payload !== "object") return "Request body must be a JSON object.";
  if (payload.survey !== "global_ai_readiness_survey") return "Invalid survey value.";
  if (!["ja", "en", "zh", "es"].includes(payload.language)) return "Invalid language value.";
  if (!isString(payload.submitted_at, 40) || Number.isNaN(Date.parse(payload.submitted_at))) return "Invalid submitted_at value.";
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

function createRecord(payload, request) {
  const receivedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  return {
    id,
    received_at: receivedAt,
    source: {
      user_agent: request.get("user-agent") || "",
      forwarded_for: request.get("x-forwarded-for") || ""
    },
    response: payload
  };
}

function jsonBuffer(record) {
  return Buffer.from(JSON.stringify(record, null, 2), "utf8");
}

function blobName(record) {
  const date = record.received_at.slice(0, 10);
  return `${date}/${record.received_at.replaceAll(":", "-")}_${record.id}.json`;
}

async function saveToAzureBlob(record) {
  const credential = new DefaultAzureCredential();
  const blobServiceClient = new BlobServiceClient(
    `https://${storageAccountName}.blob.core.windows.net`,
    credential
  );
  const containerClient = blobServiceClient.getContainerClient(storageContainerName);
  await containerClient.createIfNotExists();
  const name = blobName(record);
  await containerClient.getBlockBlobClient(name).uploadData(jsonBuffer(record), {
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" },
    metadata: {
      survey: "global_ai_readiness_survey",
      language: record.response.language
    }
  });
  return { kind: "azure_blob", container: storageContainerName, name };
}

async function saveToLocalFile(record) {
  await fs.mkdir(localResponseDir, { recursive: true });
  const name = blobName(record).replace(/\//g, "_");
  const filePath = path.join(localResponseDir, name);
  await fs.writeFile(filePath, jsonBuffer(record));
  return { kind: "local_file", path: filePath };
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
