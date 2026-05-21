const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "test-results", "simulated");
const chartDir = path.join(outDir, "charts");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(chartDir, { recursive: true });

const labels = {
  q01: { japan_headquarters: "日本本社", domestic_subsidiary: "国内子会社", overseas_subsidiary: "海外子会社", other: "その他" },
  q02: { japan: "日本", asia_pacific: "アジア太平洋", north_america: "北米", europe: "欧州", other: "その他" },
  q03: { corporate_planning: "経営企画", sales: "営業", marketing: "マーケティング", hr: "人事", accounting_finance: "経理・財務", legal: "法務", it: "情報システム", development_engineering: "開発・技術", qa_testing: "QA・テスト", customer_support: "カスタマーサポート", bpo_operations: "BPO・オペレーション", administration: "管理部門", other: "その他" },
  q04: { executive: "経営層", department_head: "部門長", manager: "マネージャー", leader: "リーダー", member: "メンバー", other: "その他" },
  q05: { using: "利用している", trial_use: "試験的に利用している", used_before_not_now: "過去に利用したが現在は利用していない", not_using: "利用していない", not_using_due_to_ban_or_unclear_rules: "利用禁止またはルール不明のため使っていない" },
  q06: { daily: "毎日", several_times_week: "週に数回", several_times_month: "月に数回", rarely: "ほとんど使わない", not_using: "利用していない" },
  q07: { chatgpt: "ChatGPT", microsoft_copilot: "Microsoft Copilot", google_gemini: "Google Gemini", claude: "Claude", perplexity: "Perplexity", internal_ai_chatbot: "社内AIチャットボット", translation_ai: "翻訳AI", meeting_minutes_ai: "議事録AI", code_generation_ai: "コード生成AI", other: "その他", not_using: "利用していない" },
  q08: { writing: "文章作成", summarization: "要約", translation: "翻訳", email_writing: "メール作成", meeting_minutes: "議事録作成", research: "調査・リサーチ", proposal_creation: "提案書作成", contract_review_support: "契約書レビュー補助", data_analysis: "データ分析", code_generation: "コード生成", code_review: "ソースコードレビュー", specification_creation: "仕様書作成", test_case_creation: "テストケース作成", test_automation: "テスト自動化", inquiry_response: "問い合わせ対応", faq_creation: "FAQ作成", image_video_content_creation: "画像・動画・コンテンツ制作", other: "その他", not_using: "利用していない" },
  q09: { public_information_only: "公開情報のみ", internal_general_information: "社内一般情報", internal_confidential_information: "社内機密情報", customer_provided_materials: "顧客から受領した資料", personal_information: "個人情報", contracts: "契約書", financial_information: "財務情報", source_code: "ソースコード", specifications_design_docs: "仕様書・設計書", incident_defect_information: "障害情報・不具合情報", do_not_remember: "入力した内容を覚えていない", not_using: "利用していない" },
  q10: { company_approved_tool: "会社承認済みのツールを使っている", department_decision: "部門判断で使っている", personal_decision: "個人判断で使っている", approval_status_unknown: "承認状況が分からない", not_using: "利用していない" },
  q11: { fully_understand: "十分理解している", mostly_understand: "ある程度理解している", do_not_understand_much: "あまり理解していない", do_not_understand_at_all: "まったく理解していない", do_not_know_if_rules_exist: "ルールがあるか分からない" },
  q12: { confidential_information_leakage: "機密情報漏えい", personal_information_leakage: "個人情報漏えい", customer_contract_violation: "顧客契約違反", copyright_infringement: "著作権侵害", answer_accuracy: "回答の正確性", responsibility_for_output: "出力内容の責任所在", usage_log_management: "利用ログの管理", internal_rules_unclear: "社内ルールが不明", cannot_explain_to_customers: "顧客に説明できない", no_concern: "特に不安はない", other: "その他" },
  q13: { reduced_30_percent_or_more: "30%以上削減", reduced_10_to_30_percent: "10〜30%削減", reduced_5_to_10_percent: "5〜10%削減", reduced_less_than_5_percent: "5%未満の削減", no_effect_felt: "効果は感じていない", more_effort_required: "むしろ手間が増えている", cannot_judge: "判断できない", not_using: "利用していない" },
  q14: { greatly_improved: "大きく向上", somewhat_improved: "ある程度向上", slightly_improved: "少し向上", unchanged: "変わらない", declined: "低下している", cannot_judge: "判断できない", not_using: "利用していない" },
  q15: { personal_trial_only: "個人的に試しているだけ", supportive_use_in_some_tasks: "一部作業で補助的に使っている", standard_team_work: "チーム内の標準作業", formal_department_process: "部門の正式プロセス", essential_to_work: "AIなしでは業務が成立しない", not_using: "利用していない" },
  q16: { executives_clearly_promote: "経営層が明確に推進", department_heads_managers_promote: "部門長・管理職が推進", some_leaders_promote: "一部リーダーが推進", left_to_frontline: "現場任せ", cautious_or_restrictive: "慎重・抑制的", do_not_know: "分からない" },
  q17: { company_official_training: "全社公式研修", department_training: "部門研修", external_training: "外部研修", self_learning: "自主学習", no_training: "受けたことがない", do_not_know_if_training_exists: "研修が存在するか分からない" },
  q18: { strongly_want_to_use: "強く利用したい", want_to_use: "利用したい", depends_on_conditions: "条件次第で利用したい", do_not_really_want_to_use: "あまり利用したくない", do_not_want_to_use: "利用したくない", cannot_judge: "判断できない" },
  q19: { secure_chat_ai: "安全なチャットAI", internal_document_search: "社内文書検索", translation: "翻訳", summarization: "要約", meeting_minutes: "議事録作成", proposal_creation_support: "提案書作成支援", contract_review_support: "契約書レビュー支援", code_generation: "コード生成", test_design_support: "テスト設計支援", faq_creation: "FAQ作成", customer_response_support: "顧客対応支援", data_analysis: "データ分析", business_system_integration: "業務システム連携", ai_agent_task_automation: "AIエージェントによる作業自動化", other: "その他" }
};

const responses = [
  { q01: "japan_headquarters", q02: "japan", q03: "qa_testing", q04: "manager", q05: "using", q06: "daily", q07: ["chatgpt", "microsoft_copilot"], q08: ["writing", "summarization", "test_case_creation", "test_automation"], q09: ["public_information_only", "internal_general_information"], q10: "company_approved_tool", q11: "mostly_understand", q12: ["answer_accuracy", "responsibility_for_output", "internal_rules_unclear"], q13: "reduced_10_to_30_percent", q14: "somewhat_improved", q15: "supportive_use_in_some_tasks", q16: "department_heads_managers_promote", q17: "company_official_training", q18: "want_to_use", q19: ["secure_chat_ai", "internal_document_search", "summarization", "test_design_support", "ai_agent_task_automation"], q20: "社内規程や過去資料を探す時間を減らしたい" },
  { q01: "domestic_subsidiary", q02: "japan", q03: "sales", q04: "member", q05: "trial_use", q06: "several_times_week", q07: ["chatgpt", "translation_ai"], q08: ["email_writing", "translation", "proposal_creation"], q09: ["public_information_only", "internal_general_information"], q10: "department_decision", q11: "do_not_understand_much", q12: ["confidential_information_leakage", "answer_accuracy", "internal_rules_unclear"], q13: "reduced_5_to_10_percent", q14: "slightly_improved", q15: "personal_trial_only", q16: "some_leaders_promote", q17: "no_training", q18: "depends_on_conditions", q19: ["secure_chat_ai", "translation", "proposal_creation_support"], q20: "提案書のたたき台作成を効率化したい" },
  { q01: "overseas_subsidiary", q02: "asia_pacific", q03: "customer_support", q04: "leader", q05: "using", q06: "daily", q07: ["google_gemini", "internal_ai_chatbot", "translation_ai"], q08: ["translation", "inquiry_response", "faq_creation", "summarization"], q09: ["public_information_only", "customer_provided_materials", "do_not_remember"], q10: "approval_status_unknown", q11: "do_not_know_if_rules_exist", q12: ["personal_information_leakage", "customer_contract_violation", "cannot_explain_to_customers"], q13: "reduced_10_to_30_percent", q14: "somewhat_improved", q15: "standard_team_work", q16: "left_to_frontline", q17: "do_not_know_if_training_exists", q18: "strongly_want_to_use", q19: ["secure_chat_ai", "customer_response_support", "faq_creation", "translation", "business_system_integration"], q20: "顧客問い合わせ履歴から回答候補を作りたい" },
  { q01: "japan_headquarters", q02: "japan", q03: "legal", q04: "department_head", q05: "not_using_due_to_ban_or_unclear_rules", q06: "not_using", q07: ["not_using"], q08: ["not_using"], q09: ["not_using"], q10: "not_using", q11: "mostly_understand", q12: ["confidential_information_leakage", "customer_contract_violation", "copyright_infringement"], q13: "not_using", q14: "not_using", q15: "not_using", q16: "cautious_or_restrictive", q17: "company_official_training", q18: "depends_on_conditions", q19: ["contract_review_support", "secure_chat_ai"], q20: "契約書レビュー補助は安全な環境なら検討したい" },
  { q01: "domestic_subsidiary", q02: "japan", q03: "it", q04: "manager", q05: "using", q06: "daily", q07: ["microsoft_copilot", "internal_ai_chatbot", "code_generation_ai"], q08: ["code_generation", "code_review", "specification_creation", "data_analysis"], q09: ["internal_general_information", "source_code", "specifications_design_docs"], q10: "company_approved_tool", q11: "fully_understand", q12: ["usage_log_management", "answer_accuracy"], q13: "reduced_30_percent_or_more", q14: "greatly_improved", q15: "formal_department_process", q16: "executives_clearly_promote", q17: "department_training", q18: "strongly_want_to_use", q19: ["code_generation", "internal_document_search", "business_system_integration", "ai_agent_task_automation"], q20: "社内システム改修の影響調査を短縮したい" },
  { q01: "overseas_subsidiary", q02: "europe", q03: "accounting_finance", q04: "member", q05: "used_before_not_now", q06: "rarely", q07: ["chatgpt"], q08: ["summarization", "translation"], q09: ["public_information_only", "financial_information"], q10: "personal_decision", q11: "do_not_understand_much", q12: ["confidential_information_leakage", "personal_information_leakage", "usage_log_management"], q13: "cannot_judge", q14: "cannot_judge", q15: "personal_trial_only", q16: "do_not_know", q17: "no_training", q18: "want_to_use", q19: ["secure_chat_ai", "data_analysis", "summarization"], q20: "月次資料の要約と差分確認を効率化したい" },
  { q01: "japan_headquarters", q02: "japan", q03: "development_engineering", q04: "leader", q05: "using", q06: "several_times_week", q07: ["chatgpt", "claude", "code_generation_ai"], q08: ["code_generation", "code_review", "specification_creation", "test_case_creation"], q09: ["internal_general_information", "source_code", "incident_defect_information"], q10: "approval_status_unknown", q11: "mostly_understand", q12: ["answer_accuracy", "responsibility_for_output", "usage_log_management"], q13: "reduced_10_to_30_percent", q14: "somewhat_improved", q15: "standard_team_work", q16: "some_leaders_promote", q17: "self_learning", q18: "strongly_want_to_use", q19: ["code_generation", "test_design_support", "internal_document_search", "ai_agent_task_automation"], q20: "仕様変更時のテスト影響範囲を早く把握したい" },
  { q01: "domestic_subsidiary", q02: "japan", q03: "hr", q04: "member", q05: "not_using", q06: "not_using", q07: ["not_using"], q08: ["not_using"], q09: ["not_using"], q10: "not_using", q11: "do_not_know_if_rules_exist", q12: ["internal_rules_unclear", "personal_information_leakage"], q13: "not_using", q14: "not_using", q15: "not_using", q16: "left_to_frontline", q17: "do_not_know_if_training_exists", q18: "depends_on_conditions", q19: ["secure_chat_ai", "summarization", "faq_creation"], q20: "人事制度に関する社内FAQを探しやすくしたい" },
  { q01: "overseas_subsidiary", q02: "north_america", q03: "marketing", q04: "manager", q05: "using", q06: "several_times_week", q07: ["chatgpt", "perplexity", "google_gemini"], q08: ["research", "writing", "image_video_content_creation", "proposal_creation"], q09: ["public_information_only", "internal_general_information"], q10: "personal_decision", q11: "mostly_understand", q12: ["copyright_infringement", "answer_accuracy", "cannot_explain_to_customers"], q13: "reduced_5_to_10_percent", q14: "somewhat_improved", q15: "supportive_use_in_some_tasks", q16: "department_heads_managers_promote", q17: "external_training", q18: "want_to_use", q19: ["proposal_creation_support", "data_analysis", "secure_chat_ai", "translation"], q20: "市場調査メモを短時間で比較整理したい" },
  { q01: "japan_headquarters", q02: "japan", q03: "corporate_planning", q04: "executive", q05: "trial_use", q06: "several_times_month", q07: ["microsoft_copilot", "chatgpt"], q08: ["summarization", "proposal_creation", "data_analysis"], q09: ["public_information_only", "internal_general_information"], q10: "company_approved_tool", q11: "fully_understand", q12: ["answer_accuracy", "responsibility_for_output"], q13: "reduced_less_than_5_percent", q14: "slightly_improved", q15: "supportive_use_in_some_tasks", q16: "executives_clearly_promote", q17: "company_official_training", q18: "strongly_want_to_use", q19: ["internal_document_search", "data_analysis", "ai_agent_task_automation", "secure_chat_ai"], q20: "経営会議資料の論点整理を支援してほしい" }
];

const headers = ["survey", "language", "submitted_at", ...Array.from({ length: 20 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`)];
const baseTime = new Date("2026-05-21T05:10:00.000Z");

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function answerValue(response, id) {
  const value = response[id];
  return Array.isArray(value) ? value.join(";") : value;
}

function labelValue(id, value) {
  if (Array.isArray(value)) return value.map((item) => labels[id]?.[item] || item).join("、");
  return labels[id]?.[value] || value || "";
}

function countSingle(id) {
  const result = new Map();
  for (const response of responses) {
    const value = response[id];
    const key = Array.isArray(value) ? value.join(";") : value;
    result.set(key, (result.get(key) || 0) + 1);
  }
  return [...result.entries()].sort((a, b) => b[1] - a[1]);
}

function countMulti(id) {
  const result = new Map();
  for (const response of responses) {
    for (const value of response[id]) {
      result.set(value, (result.get(value) || 0) + 1);
    }
  }
  return [...result.entries()].sort((a, b) => b[1] - a[1]);
}

function pct(count) {
  return `${Math.round((count / responses.length) * 100)}%`;
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = (angle - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function piePath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

function writePieChart(filename, title, entries, idForLabel = null) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const colors = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#65a30d", "#be123c", "#475569", "#9333ea"];
  let angle = 0;
  const slices = entries.map(([key, count], index) => {
    const nextAngle = angle + (count / total) * 360;
    const pathData = piePath(150, 150, 105, angle, nextAngle);
    const label = idForLabel ? labelValue(idForLabel, key) : key;
    const slice = `<path d="${pathData}" fill="${colors[index % colors.length]}"><title>${label}: ${count} (${pct(count)})</title></path>`;
    angle = nextAngle;
    return slice;
  }).join("\n    ");
  const legend = entries.map(([key, count], index) => {
    const label = idForLabel ? labelValue(idForLabel, key) : key;
    const y = 58 + index * 24;
    return `<rect x="292" y="${y - 12}" width="14" height="14" fill="${colors[index % colors.length]}"/><text x="314" y="${y}" font-size="13" fill="#18212f">${label} ${count}件 ${pct(count)}</text>`;
  }).join("\n    ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="320" viewBox="0 0 620 320" role="img" aria-label="${title}">
  <rect width="620" height="320" fill="#ffffff"/>
  <text x="24" y="30" font-size="18" font-weight="700" fill="#18212f">${title}</text>
  <g>
    ${slices}
  </g>
  <circle cx="150" cy="150" r="56" fill="#ffffff"/>
  <text x="150" y="146" text-anchor="middle" font-size="22" font-weight="700" fill="#18212f">${total}</text>
  <text x="150" y="168" text-anchor="middle" font-size="12" fill="#5d6979">回答</text>
  <g>
    ${legend}
  </g>
</svg>
`;
  fs.writeFileSync(path.join(chartDir, filename), svg, "utf8");
}

const rawRows = responses.map((response, index) => {
  const submitted = new Date(baseTime.getTime() + index * 3 * 60 * 1000).toISOString();
  return ["global_ai_readiness_survey", "ja", submitted, ...headers.slice(3).map((id) => answerValue(response, id))];
});

const labelRows = responses.map((response, index) => {
  const submitted = new Date(baseTime.getTime() + index * 3 * 60 * 1000).toISOString();
  return ["global_ai_readiness_survey", "日本語", submitted, ...headers.slice(3).map((id) => labelValue(id, response[id]))];
});

fs.writeFileSync(
  path.join(outDir, "global_ai_readiness_survey_simulated_10.csv"),
  `${headers.map(escapeCsv).join(",")}\r\n${rawRows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`,
  "utf8"
);

fs.writeFileSync(
  path.join(outDir, "global_ai_readiness_survey_simulated_10_labels.csv"),
  `${headers.map(escapeCsv).join(",")}\r\n${labelRows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`,
  "utf8"
);

fs.writeFileSync(
  path.join(outDir, "global_ai_readiness_survey_simulated_10.json"),
  JSON.stringify(responses.map((answers, index) => ({
    survey: "global_ai_readiness_survey",
    language: "ja",
    submitted_at: new Date(baseTime.getTime() + index * 3 * 60 * 1000).toISOString(),
    answers
  })), null, 2),
  "utf8"
);

const activeUsage = responses.filter((r) => ["using", "trial_use"].includes(r.q05)).length;
const dailyOrWeekly = responses.filter((r) => ["daily", "several_times_week"].includes(r.q06)).length;
const approved = responses.filter((r) => r.q10 === "company_approved_tool").length;
const shadowOrUnknown = responses.filter((r) => ["department_decision", "personal_decision", "approval_status_unknown"].includes(r.q10)).length;
const highRisk = responses.filter((r) => r.q09.some((v) => ["internal_confidential_information", "customer_provided_materials", "personal_information", "contracts", "financial_information", "source_code", "specifications_design_docs", "incident_defect_information", "do_not_remember"].includes(v))).length;
const trained = responses.filter((r) => ["company_official_training", "department_training", "external_training"].includes(r.q17)).length;
const wantsEnterprise = responses.filter((r) => ["strongly_want_to_use", "want_to_use"].includes(r.q18)).length;
const productivity10Plus = responses.filter((r) => ["reduced_30_percent_or_more", "reduced_10_to_30_percent"].includes(r.q13)).length;

writePieChart("usage_status.svg", "AI利用状況", countSingle("q05"), "q05");
writePieChart("approval_status.svg", "AIツール承認状況", countSingle("q10"), "q10");
writePieChart("enterprise_llm_intent.svg", "エンタープライズLLM利用意向", countSingle("q18"), "q18");
writePieChart("training_status.svg", "教育・研修受講状況", countSingle("q17"), "q17");
writePieChart("company_distribution.svg", "所属会社分布", countSingle("q01"), "q01");
writePieChart("region_distribution.svg", "国・地域分布", countSingle("q02"), "q02");
writePieChart("usage_frequency.svg", "AI利用頻度", countSingle("q06"), "q06");
writePieChart("tools_used.svg", "利用ツール 選択数", countMulti("q07"), "q07");
writePieChart("task_usage.svg", "利用業務 選択数", countMulti("q08"), "q08");
writePieChart("information_input.svg", "入力情報種別 選択数", countMulti("q09"), "q09");
writePieChart("rule_understanding.svg", "AI利用ルール理解", countSingle("q11"), "q11");
writePieChart("concerns.svg", "AI利用時の不安点 選択数", countMulti("q12"), "q12");
writePieChart("time_reduction.svg", "時間削減効果", countSingle("q13"), "q13");
writePieChart("process_maturity.svg", "業務プロセス組み込み度", countSingle("q15"), "q15");
writePieChart("expected_features.svg", "期待機能 選択数", countMulti("q19"), "q19");

function tableRows(entries, id, max = 8) {
  return entries.slice(0, max).map(([key, count]) => `| ${labelValue(id, Array.isArray(key) ? key : key)} | ${count} | ${pct(count)} |`).join("\n");
}

const report = `# 疑似10名回答 分析レポート

## 1. 入力データ

- 生データCSV: \`test-results/simulated/global_ai_readiness_survey_simulated_10.csv\`
- ラベル付きCSV: \`test-results/simulated/global_ai_readiness_survey_simulated_10_labels.csv\`
- JSON: \`test-results/simulated/global_ai_readiness_survey_simulated_10.json\`
- 回答数: 10件
- 注意: 本データは動作確認用の疑似回答であり、実際の社員回答ではない。

## 2. サマリー

| 指標 | 件数 | 割合 |
|---|---:|---:|
| 現在利用または試験利用している | ${activeUsage} | ${pct(activeUsage)} |
| 毎日または週数回利用 | ${dailyOrWeekly} | ${pct(dailyOrWeekly)} |
| 会社承認済みツール利用 | ${approved} | ${pct(approved)} |
| 部門判断・個人判断・承認不明 | ${shadowOrUnknown} | ${pct(shadowOrUnknown)} |
| 高リスク情報入力の可能性あり | ${highRisk} | ${pct(highRisk)} |
| 公式/部門/外部研修を受講済み | ${trained} | ${pct(trained)} |
| 安全なエンタープライズLLMを利用したい | ${wantsEnterprise} | ${pct(wantsEnterprise)} |
| 10%以上の時間削減を実感 | ${productivity10Plus} | ${pct(productivity10Plus)} |

## 3. 円グラフ

### AI利用状況

![AI利用状況](charts/usage_status.svg)

### AIツール承認状況

![AIツール承認状況](charts/approval_status.svg)

### エンタープライズLLM利用意向

![エンタープライズLLM利用意向](charts/enterprise_llm_intent.svg)

### 教育・研修受講状況

![教育・研修受講状況](charts/training_status.svg)

### 所属会社分布

![所属会社分布](charts/company_distribution.svg)

## 4. 所属・地域の傾向

### 所属会社

![所属会社分布](charts/company_distribution.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q01"), "q01")}

### 国・地域

![国・地域分布](charts/region_distribution.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q02"), "q02")}

## 5. AI利用実態

### 利用状況

![AI利用状況](charts/usage_status.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q05"), "q05")}

### 利用頻度

![AI利用頻度](charts/usage_frequency.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q06"), "q06")}

### 利用ツール 上位

![利用ツール 選択数](charts/tools_used.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countMulti("q07"), "q07")}

### 利用業務 上位

![利用業務 選択数](charts/task_usage.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countMulti("q08"), "q08", 10)}

## 6. リスク・ガバナンス

### 入力情報種別 上位

![入力情報種別 選択数](charts/information_input.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countMulti("q09"), "q09", 10)}

### 承認状況

![AIツール承認状況](charts/approval_status.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q10"), "q10")}

### AI利用ルール理解

![AI利用ルール理解](charts/rule_understanding.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q11"), "q11")}

### 不安点 上位

![AI利用時の不安点 選択数](charts/concerns.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countMulti("q12"), "q12", 10)}

## 7. 効果・成熟度

### 時間削減効果

![時間削減効果](charts/time_reduction.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q13"), "q13")}

### 業務プロセス組み込み度

![業務プロセス組み込み度](charts/process_maturity.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q15"), "q15")}

### 教育・研修

![教育・研修受講状況](charts/training_status.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q17"), "q17")}

## 8. ニーズ

### エンタープライズLLM利用意向

![エンタープライズLLM利用意向](charts/enterprise_llm_intent.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countSingle("q18"), "q18")}

### 期待機能 上位

![期待機能 選択数](charts/expected_features.svg)

| 回答 | 件数 | 割合 |
|---|---:|---:|
${tableRows(countMulti("q19"), "q19", 10)}

## 9. 分析コメント

1. 利用または試験利用は${activeUsage}割相当で、疑似データ上はAI利用がかなり進んでいる。
2. 一方で、会社承認済みツール利用は${pct(approved)}にとどまり、部門判断・個人判断・承認不明が${pct(shadowOrUnknown)}ある。シャドーAI対策として、承認済みツールと利用ルールの明確化が必要。
3. 高リスク情報入力の可能性が${pct(highRisk)}あり、特に顧客資料、財務情報、ソースコード、障害情報などの扱いに注意が必要。
4. 安全なエンタープライズLLMへの利用意向は${pct(wantsEnterprise)}と高く、需要はある。導入時は「安全なチャットAI」「社内文書検索」「AIエージェントによる作業自動化」「翻訳」「データ分析」を優先候補にできる。
5. 教育受講済みは${pct(trained)}で、未受講・不明も残る。導入前に最小限の利用ルール研修と機密情報入力禁止の周知を組み合わせるべき。

## 10. 次アクション案

| 優先度 | アクション | 理由 |
|---|---|---|
| 高 | 承認済みAIツールと禁止事項を1枚に整理する | 承認不明・個人判断利用のリスクを下げる |
| 高 | 自由記述とAI入力時の機密情報禁止ルールを再周知する | 高リスク情報入力の可能性を抑える |
| 中 | 安全なチャットAIと社内文書検索を先行検討する | 需要が広く、部門横断で効果が出やすい |
| 中 | 部門別の追加ヒアリングを実施する | 営業、CS、開発、法務でニーズとリスクが異なる |
| 中 | 研修未受講者向けの短時間教育を用意する | 利用拡大前にルール理解を底上げする |
`;

fs.writeFileSync(path.join(outDir, "global_ai_readiness_survey_simulated_10_analysis.md"), report, "utf8");

console.log(`Generated simulated survey artifacts in ${outDir}`);
