import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCollection } from "../lib/parse.js";
import { createHost, toSubmitAccount } from "../lib/mcp-payloads.js";
import { containsPasswordLeak } from "../lib/sanitize.js";
import {
  planCalendar,
  planConfirmLongTermPlan,
  planConnectMcp,
  planEpisodeGaps,
  planFilmReview,
  planIntakeHandoff,
  planLongTermPlan,
  planProductionPlan,
  planProductionQa,
  planReviewCycle,
  planTopics
} from "../lib/flow.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function load(name) {
  return parseCollection(fs.readFileSync(path.join(root, name), "utf8"));
}

function printStep(title, calls) {
  console.log("\n## " + title);
  for (const item of calls) {
    if (item.skipped) {
      console.log("- skip " + (item.name || item.surface || "step") + " — " + item.note);
      continue;
    }
    const suffix = item.note ? "  // " + item.note : "";
    const args = JSON.stringify(item.args);
    if (containsPasswordLeak(item.args) || /password/i.test(args)) {
      throw new Error("dry-run 输出里出现了密码，已中止");
    }
    console.log("- " + item.name + " " + args + suffix);
  }
}

const intake = load("intake.txt");
const accountId = "acct_example";
const submit = toSubmitAccount({
  ...intake,
  record: { ...intake.record, password: "should-never-appear" }
});
if (containsPasswordLeak(submit) || JSON.stringify(submit).includes("should-never-appear")) {
  throw new Error("submit_account 映射泄漏了密码");
}

console.log("Ops MCP dry-run (no credentials, no live calls)");
console.log("Sample account_id is a placeholder: " + accountId);
console.log("submit_account payload from intake (password stripped if present):");
console.log(JSON.stringify(submit, null, 2));

printStep("1. 接入 MCP", planConnectMcp());
printStep("2. 前置信息收集（读取已保存资料后的交接）", planIntakeHandoff(intake, { account_id: accountId }));
printStep("3. 提出长期运营方案", planLongTermPlan({ account_id: accountId }));
printStep("4. 修改并确认长期方案（已有用户确认）", planConfirmLongTermPlan({
  account_id: accountId,
  version: 0,
  decision: "confirm",
  customer_words: "方案可以，先按这个走。",
  autonomy: "confirm_each"
}));
printStep("5. 前 5 期主题（含未确认项）", planTopics({
  account_id: accountId,
  topics: {
    kind: "topics",
    record: {
      topics: [
        { id: "t1", title: "第一次买房要先搞清什么", source: "user", confirmed: true, corePoint: "先理清预算再看房" },
        { id: "t2", title: "市场解读", confirmed: false }
      ]
    }
  }
}));
printStep("6. 内容日历", planCalendar({ account_id: accountId, days: 21 }));
printStep("7. 补齐本期必要信息", planEpisodeGaps({ episode: 1 }));
printStep("8. 本期制作方案（尚未确认）", planProductionPlan({
  plan: { kind: "production_plan", record: { title: "第一次买房要先搞清什么", confirmed: false } }
}));
printStep("9. 制作与内部质检", planProductionQa({ account_id: accountId }));
printStep("10. 成片审核（已确认成片，但还没有公开链接）", planFilmReview({
  account_id: accountId,
  task_id: "task_example",
  version: 1,
  customer_words: "这条可以交付。",
  review: { kind: "film_review", record: { decision: "approve" } }
}));
printStep("11. 复盘并推进下一轮", planReviewCycle({
  account_id: accountId,
  days: 14,
  daily: [{ date: "2026-11-12", followers: 1200 }]
}));

const recorded = [];
const host = createHost(async (name, args) => {
  if (containsPasswordLeak(args)) throw new Error("createHost 调用包含密码");
  recorded.push({ name, args });
  if (name === "list_accounts") return { accounts: [] };
  if (name === "submit_account") return { account_id: accountId };
  return { ok: true, dry_run: true };
});

await host.listAccounts();
await host.submitAccount(intake, { account_id: accountId });
console.log("\n## createHost dry-run");
for (const item of recorded) {
  console.log("- " + item.name + " " + JSON.stringify(item.args));
}
