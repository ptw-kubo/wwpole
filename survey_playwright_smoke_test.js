const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = __dirname;
const htmlPath = path.join(root, "global_ai_readiness_survey.html");
const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
const reportPath = path.join(root, "global_ai_readiness_survey_test_execution_report.md");
const downloadsDir = path.join(root, "test-results", "downloads");

fs.mkdirSync(downloadsDir, { recursive: true });

const tests = [];

function test(id, title, fn) {
  tests.push({ id, title, fn });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "msedge", headless: true });
  } catch (_) {
    return await chromium.launch({ headless: true });
  }
}

async function newPage(browser) {
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  const externalRequests = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:\/\//i.test(url)) externalRequests.push(url);
  });
  await page.goto(fileUrl);
  return { context, page, externalRequests };
}

async function setSingle(page, id, value) {
  await page.locator(`input[name="${id}"][value="${value}"]`).check();
}

async function setMulti(page, id, values) {
  for (const value of values) {
    await page.locator(`input[name="${id}"][value="${value}"]`).check();
  }
}

async function answerValid(page, q20 = "社内規程や過去資料を探す時間を減らしたい") {
  await setSingle(page, "q01", "japan_headquarters");
  await setSingle(page, "q02", "japan");
  await setSingle(page, "q03", "qa_testing");
  await setSingle(page, "q04", "manager");
  await setSingle(page, "q05", "using");
  await setSingle(page, "q06", "daily");
  await setMulti(page, "q07", ["chatgpt", "microsoft_copilot"]);
  await setMulti(page, "q08", ["writing", "summarization", "translation", "test_case_creation", "test_automation"]);
  await setMulti(page, "q09", ["public_information_only", "internal_general_information"]);
  await setSingle(page, "q10", "company_approved_tool");
  await setSingle(page, "q11", "mostly_understand");
  await setMulti(page, "q12", ["answer_accuracy", "responsibility_for_output", "internal_rules_unclear"]);
  await setSingle(page, "q13", "reduced_10_to_30_percent");
  await setSingle(page, "q14", "somewhat_improved");
  await setSingle(page, "q15", "supportive_use_in_some_tasks");
  await setSingle(page, "q16", "department_heads_managers_promote");
  await setSingle(page, "q17", "company_official_training");
  await setSingle(page, "q18", "want_to_use");
  await setMulti(page, "q19", ["secure_chat_ai", "internal_document_search", "summarization", "test_design_support", "ai_agent_task_automation"]);
  await page.locator('textarea[name="q20"]').fill(q20);
}

async function checkedCount(page, id) {
  return await page.locator(`input[name="${id}"]:checked`).count();
}

async function readDownload(download) {
  const target = path.join(downloadsDir, download.suggestedFilename());
  await download.saveAs(target);
  return fs.readFileSync(target, "utf8");
}

test("P0-001", "初期表示で20問、結果パネル非表示、進捗0/20", async ({ page }) => {
  await assert.equal(await page.locator(".question").count(), 20);
  await assert.equal(await page.locator("#resultPanel.active").count(), 0);
  await assert.match(await page.locator("#progressText").textContent(), /0\s*\/\s*20/);
});

test("P0-002", "全未回答送信でQ1〜Q19の必須エラーを表示", async ({ page }) => {
  await page.locator("#submitButton").click();
  await assert.equal(await page.locator(".error").count(), 19);
  await assert.equal(await page.locator("#resultPanel.active").count(), 0);
});

test("P0-003", "Q8/Q12/Q19の最大選択数を超えた選択を拒否", async ({ page }) => {
  await setMulti(page, "q08", ["writing", "summarization", "translation", "email_writing", "meeting_minutes"]);
  await page.locator('input[name="q08"][value="research"]').click();
  await assert.equal(await checkedCount(page, "q08"), 5);
  await assert.equal(await page.locator('input[name="q08"][value="research"]').isChecked(), false);

  await setMulti(page, "q12", ["confidential_information_leakage", "personal_information_leakage", "customer_contract_violation"]);
  await page.locator('input[name="q12"][value="copyright_infringement"]').click();
  await assert.equal(await checkedCount(page, "q12"), 3);
  await assert.equal(await page.locator('input[name="q12"][value="copyright_infringement"]').isChecked(), false);

  await setMulti(page, "q19", ["secure_chat_ai", "internal_document_search", "translation", "summarization", "meeting_minutes"]);
  await page.locator('input[name="q19"][value="proposal_creation_support"]').click();
  await assert.equal(await checkedCount(page, "q19"), 5);
  await assert.equal(await page.locator('input[name="q19"][value="proposal_creation_support"]').isChecked(), false);
});

test("P0-004", "Q20は300文字で制限される", async ({ page }) => {
  const text = "あ".repeat(301);
  await page.locator('textarea[name="q20"]').fill(text);
  await assert.equal(await page.locator('textarea[name="q20"]').inputValue(), "あ".repeat(300));
  await assert.match(await page.locator("#textCounter").textContent(), /300\s*\/\s*300/);
});

test("P0-005", "正常回答で結果パネルを表示し進捗20/20", async ({ page }) => {
  await answerValid(page);
  await assert.match(await page.locator("#progressText").textContent(), /20\s*\/\s*20/);
  await page.locator("#submitButton").click();
  await assert.equal(await page.locator("#resultPanel.active").count(), 1);
});

test("P0-006", "JSON保存は必須メタ情報と回答値を含む", async ({ page }) => {
  await answerValid(page);
  await page.locator("#submitButton").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#downloadJson").click()
  ]);
  const json = JSON.parse(await readDownload(download));
  await assert.equal(json.survey, "global_ai_readiness_survey");
  await assert.equal(json.language, "ja");
  await assert.ok(json.submitted_at);
  await assert.equal(Object.keys(json.answers).length, 20);
  await assert.deepEqual(json.answers.q08, ["writing", "summarization", "translation", "test_case_creation", "test_automation"]);
});

test("P0-007", "CSV保存はヘッダー、複数値、特殊文字エスケープを保持", async ({ page }) => {
  await answerValid(page, 'CSV, quote "test"\nnew line');
  await page.locator("#submitButton").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#downloadCsv").click()
  ]);
  const csv = await readDownload(download);
  await assert.match(csv, /^"survey","language","submitted_at","q01"/);
  await assert.match(csv, /"writing;summarization;translation;test_case_creation;test_automation"/);
  await assert.match(csv, /"CSV, quote ""test""\r?\nnew line"/);
});

test("P0-008", "外部HTTP/HTTPS通信が発生しない", async ({ page, externalRequests }) => {
  await answerValid(page);
  await page.locator("#submitButton").click();
  await page.locator("#downloadJson").click();
  await page.waitForTimeout(200);
  await assert.deepEqual(externalRequests, []);
});

test("P1-001", "言語切替で文言が変わり回答は保持される", async ({ page }) => {
  await setSingle(page, "q01", "japan_headquarters");
  await page.locator('[data-language="en"]').click();
  await assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await assert.equal(await page.locator('input[name="q01"][value="japan_headquarters"]').isChecked(), true);
  await assert.match(await page.locator("#pageTitle").textContent(), /Global AI Readiness Survey/);
});

test("P1-001b", "8言語の切替ボタンが表示され各言語で描画できる", async ({ page }) => {
  const expectedLanguages = ["ja", "en", "fr", "es", "pt", "vi", "zh", "ko"];
  await assert.equal(await page.locator("[data-language]").count(), expectedLanguages.length);
  for (const language of expectedLanguages) {
    await page.locator(`[data-language="${language}"]`).click();
    await assert.match(await page.locator("html").getAttribute("lang"), new RegExp(`^${language}`));
    await assert.equal(await page.locator(".question").count(), 20);
  }
});

test("P1-002", "クリアで回答、エラー、結果パネル、進捗を初期化", async ({ page }) => {
  await answerValid(page);
  await page.locator("#submitButton").click();
  await page.locator("#clearButton").click();
  await assert.equal(await page.locator("input:checked").count(), 0);
  await assert.equal(await page.locator('textarea[name="q20"]').inputValue(), "");
  await assert.equal(await page.locator(".error").count(), 0);
  await assert.equal(await page.locator("#resultPanel.active").count(), 0);
  await assert.match(await page.locator("#progressText").textContent(), /0\s*\/\s*20/);
});

test("P1-003", "XSS風入力はスクリプト実行されず文字列として保存", async ({ page }) => {
  let dialogShown = false;
  page.on("dialog", async (dialog) => {
    dialogShown = true;
    await dialog.dismiss();
  });
  await answerValid(page, "<script>alert(1)</script>");
  await page.locator("#submitButton").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#downloadJson").click()
  ]);
  const json = JSON.parse(await readDownload(download));
  await assert.equal(dialogShown, false);
  await assert.equal(json.answers.q20, "<script>alert(1)</script>");
});

test("NF-001", "代表3画面幅で主要導線を実行できる", async ({ browser }) => {
  const viewports = [
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 }
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo"
    });
    const page = await context.newPage();
    await page.goto(fileUrl);
    await assert.equal(await page.locator(".question").count(), 20);
    await answerValid(page);
    await page.locator("#submitButton").click();
    await assert.equal(await page.locator("#resultPanel.active").count(), 1);
    await context.close();
  }
});

(async () => {
  const startedAt = new Date();
  const browser = await launchBrowser();
  const results = [];

  for (const item of tests) {
    const started = Date.now();
    let context;
    let page;
    let externalRequests = [];
    try {
      if (item.id === "NF-001") {
        await item.fn({ browser });
      } else {
        const fixture = await newPage(browser);
        context = fixture.context;
        page = fixture.page;
        externalRequests = fixture.externalRequests;
        await item.fn({ page, context, externalRequests, browser });
      }
      results.push({ ...item, status: "PASS", durationMs: Date.now() - started });
    } catch (error) {
      results.push({ ...item, status: "FAIL", durationMs: Date.now() - started, error });
    } finally {
      if (context) await context.close();
    }
  }

  await browser.close();

  const passCount = results.filter((result) => result.status === "PASS").length;
  const failCount = results.length - passCount;
  const lines = [
    "# Global AI Readiness Survey テスト実行結果",
    "",
    `- 実行日時: ${startedAt.toISOString()}`,
    `- 対象: ${htmlPath}`,
    `- 実行環境: Playwright Chromium/Edge headless`,
    `- 結果: ${passCount}/${results.length} PASS, ${failCount} FAIL`,
    "",
    "| No | テスト | 結果 | 実行時間(ms) | 備考 |",
    "|---|---|---|---:|---|"
  ];

  for (const result of results) {
    const note = result.error ? String(result.error.stack || result.error.message).replace(/\r?\n/g, "<br>") : "";
    lines.push(`| ${result.id} | ${result.title} | ${result.status} | ${result.durationMs} | ${note} |`);
  }

  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

  console.log(`${passCount}/${results.length} PASS, ${failCount} FAIL`);
  for (const result of results.filter((item) => item.status === "FAIL")) {
    console.error(`${result.id} ${result.title}`);
    console.error(result.error?.stack || result.error?.message || result.error);
  }
  console.log(reportPath);
  if (failCount > 0) process.exitCode = 1;
})();
