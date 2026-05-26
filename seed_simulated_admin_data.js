const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const sourcePath = path.join(root, "test-results", "simulated", "global_ai_readiness_survey_simulated_10.json");
const responseRoot = process.env.LOCAL_RESPONSE_DIR || path.join(root, "data", "responses");
const baseReceivedAt = new Date("2026-05-26T01:00:00.000Z");
const languages = ["ja", "en", "fr", "es", "pt", "vi", "zh", "ko", "ja", "en"];
const companies = [
  "jp-hq-7kx92",
  "jp-sales-2mqa8",
  "vn-support-5qf31",
  "fr-finance-8tnd2",
  "br-dev-6psa4",
  "kr-qa-9mzc1",
  "cn-ops-3avx7",
  "es-mkt-4cwn6",
  "us-dev-1hkr5",
  "jp-plan-0bte3"
];

function responseCodeHash(companyCode, responseCode) {
  return crypto
    .createHash("sha256")
    .update(`${companyCode.toLowerCase()}:${responseCode.trim().toUpperCase()}`)
    .digest("hex");
}

function jsonPathFor(record) {
  const date = record.received_at.slice(0, 10);
  const baseName = `${record.received_at.replaceAll(":", "-")}_${record.id}`;
  return path.join(responseRoot, date, "json", `${baseName}.json`);
}

function createRecord(item, index) {
  const companyCode = companies[index];
  const responseCode = `simulated-${String(index + 1).padStart(4, "0")}`;
  const receivedAt = new Date(baseReceivedAt.getTime() + index * 7 * 60 * 1000).toISOString();
  return {
    id: crypto.randomUUID(),
    received_at: receivedAt,
    company_code: companyCode,
    response_code_hash: responseCodeHash(companyCode, responseCode),
    source: {
      user_agent: "simulated-admin-seed",
      forwarded_for: ""
    },
    response: {
      survey: "global_ai_readiness_survey",
      language: languages[index],
      respondent_id: crypto.randomUUID(),
      submitted_at: item.submitted_at,
      answers: item.answers
    }
  };
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Simulated source JSON not found: ${sourcePath}. Run npm run simulate first.`);
}

const simulated = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (!Array.isArray(simulated) || simulated.length !== 10) {
  throw new Error(`Expected 10 simulated responses in ${sourcePath}.`);
}

fs.rmSync(responseRoot, { recursive: true, force: true });
const records = simulated.map(createRecord);
for (const record of records) {
  const filePath = jsonPathFor(record);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
}

console.log(`Seeded ${records.length} simulated admin responses into ${responseRoot}`);
