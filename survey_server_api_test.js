const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = __dirname;
const port = 18080;
const baseUrl = `http://127.0.0.1:${port}`;
const responseDir = path.join(root, "test-results", "server-api", "responses");

fs.rmSync(path.join(root, "test-results", "server-api"), { recursive: true, force: true });
fs.mkdirSync(responseDir, { recursive: true });

function validPayload() {
  return {
    survey: "global_ai_readiness_survey",
    language: "ja",
    company_code: "jp-hq-7kx92",
    response_code: "qa-test-0001",
    respondent_id: "11111111-1111-4111-8111-111111111111",
    submitted_at: new Date().toISOString(),
    answers: {
      q01: "japan_headquarters",
      q02: "japan",
      q03: "qa_testing",
      q04: "manager",
      q05: "using",
      q06: "daily",
      q07: ["chatgpt", "microsoft_copilot"],
      q08: ["writing", "summarization", "translation", "test_case_creation", "test_automation"],
      q09: ["public_information_only", "internal_general_information"],
      q10: "company_approved_tool",
      q11: "mostly_understand",
      q12: ["answer_accuracy", "responsibility_for_output", "internal_rules_unclear"],
      q13: "reduced_10_to_30_percent",
      q14: "somewhat_improved",
      q15: "supportive_use_in_some_tasks",
      q16: "department_heads_managers_promote",
      q17: "company_official_training",
      q18: "want_to_use",
      q19: ["secure_chat_ai", "internal_document_search", "summarization", "test_design_support", "ai_agent_task_automation"],
      q20: "社内規程や過去資料を探す時間を減らしたい"
    }
  };
}

function waitForServer(processHandle) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server did not start in time.")), 15000);
    processHandle.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    processHandle.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    processHandle.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before tests completed: ${code}`));
    });
  });
}

(async () => {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      LOCAL_RESPONSE_DIR: responseDir,
      AZURE_STORAGE_ACCOUNT_NAME: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(server);

    const health = await fetch(`${baseUrl}/healthz`);
    await assert.equal(health.status, 200);
    await assert.deepEqual(await health.json(), { ok: true, storage: "local_file" });

    const save = await fetch(`${baseUrl}/api/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload())
    });
    await assert.equal(save.status, 201);
    const saveBody = await save.json();
    await assert.equal(saveBody.ok, true);
    await assert.equal(saveBody.storage.kind, "local_file");
    await assert.ok(fs.existsSync(saveBody.storage.json));
    await assert.ok(fs.existsSync(saveBody.storage.csv));
    await assert.ok(fs.existsSync(saveBody.storage.respondent_marker));

    const savedRecord = JSON.parse(fs.readFileSync(saveBody.storage.json, "utf8"));
    await assert.equal(savedRecord.company_code, "jp-hq-7kx92");
    await assert.match(savedRecord.response_code_hash, /^[a-f0-9]{64}$/);
    await assert.equal("response_code" in savedRecord.response, false);
    await assert.equal(savedRecord.response.survey, "global_ai_readiness_survey");
    await assert.equal(savedRecord.response.answers.q01, "japan_headquarters");
    await assert.deepEqual(savedRecord.response.answers.q08, ["writing", "summarization", "translation", "test_case_creation", "test_automation"]);

    const savedCsv = fs.readFileSync(saveBody.storage.csv, "utf8");
    await assert.match(savedCsv, /^"response_id","received_at","company_code","response_code_hash","survey","language","submitted_at","q01"/);
    await assert.match(savedCsv, /"jp-hq-7kx92","[a-f0-9]{64}","global_ai_readiness_survey","ja"/);
    await assert.match(savedCsv, /"japan_headquarters","japan","qa_testing","manager"/);
    await assert.match(savedCsv, /"global_ai_readiness_survey","ja"/);
    await assert.match(savedCsv, /"writing;summarization;translation;test_case_creation;test_automation"/);

    const duplicate = await fetch(`${baseUrl}/api/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload())
    });
    await assert.equal(duplicate.status, 409);
    await assert.equal((await duplicate.json()).code, "duplicate_response");

    const invalid = validPayload();
    delete invalid.answers.q19;
    const invalidResponse = await fetch(`${baseUrl}/api/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalid)
    });
    await assert.equal(invalidResponse.status, 400);
    await assert.equal((await invalidResponse.json()).ok, false);

    console.log("server api tests PASS");
  } finally {
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
