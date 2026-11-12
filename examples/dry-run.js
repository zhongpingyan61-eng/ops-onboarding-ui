import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCollection } from "../lib/parse.js";
import { createHost, toSubmitAccount } from "../lib/mcp-payloads.js";
import {
  planStep1Onboarding,
  planStep2Positioning,
  planStep3Production,
  planStep4ScriptAndCalendar,
  planStep5Work,
  planStep6Review,
  planStep7Publication,
  planStep8FollowUp,
  planStep9Exception
} from "../lib/flow.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function load(name) {
  return parseCollection(fs.readFileSync(path.join(root, name), "utf8"));
}

function printStep(title, calls) {
  console.log("\n## " + title);
  for (const item of calls) {
    if (item.skipped) {
      console.log("- skip " + item.name + " — " + item.note);
      continue;
    }
    const suffix = item.note ? "  // " + item.note : "";
    console.log("- " + item.name + " " + JSON.stringify(item.args) + suffix);
  }
}

const intake = load("intake.txt");
const listing = load("listing.txt");
const story = load("story.txt");
const bio = load("bio.txt");
const accountId = "acct_example";

console.log("Ops MCP dry-run (no credentials, no live calls)");
console.log("Sample account_id is a placeholder: " + accountId);
console.log("submit_account payload from intake paste:");
console.log(JSON.stringify(toSubmitAccount(intake), null, 2));

printStep("1. 开号接入", planStep1Onboarding(intake, { account_id: accountId }));
printStep("2. 定位方案（已有用户确认）", planStep2Positioning({
  account_id: accountId,
  version: 0,
  decision: "confirm",
  customer_words: "方案可以，先按这个走。",
  autonomy: "confirm_each"
}));
printStep("3. 选题与开始制作（用户指定内容优先）", planStep3Production({
  account_id: accountId,
  collections: [listing, story, bio]
}));
printStep("4. 脚本、日历和材料", planStep4ScriptAndCalendar({
  account_id: accountId,
  script_id: "script_example"
}));
printStep("5. 制作与交付", planStep5Work(accountId));
printStep("6. 验收与修改", planStep6Review({
  account_id: accountId,
  task_id: "task_example",
  version: 1,
  decision: "approve",
  customer_words: "这条可以交付。"
}));
printStep("7. 发布前确认（还没有公开链接）", planStep7Publication({
  account_id: accountId,
  task_id: "task_example"
}));
printStep("7b. 发布前确认（已有真实公开链接）", planStep7Publication({
  account_id: accountId,
  task_id: "task_example",
  url: "https://www.instagram.com/p/example"
}));
printStep("8. 发布后跟进", planStep8FollowUp({
  account_id: accountId,
  days: 14,
  daily: [{ date: "2026-11-12", followers: 1200 }]
}));
printStep("9. 异常与停运（未要求删除）", planStep9Exception({ account_id: accountId }));

const recorded = [];
const host = createHost(async (name, args) => {
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
