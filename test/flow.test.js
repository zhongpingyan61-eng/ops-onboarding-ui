import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCollection } from "../lib/parse.js";
import {
  planCalendar,
  planConnectMcp,
  planEpisodeGaps,
  planFilmReview,
  planProductionPlan,
  planStep1Onboarding,
  planStep2Positioning,
  planStep3Production,
  planStep7Publication,
  planTopics,
  STEPS
} from "../lib/flow.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../examples/fixtures");
const load = (name) => parseCollection(fs.readFileSync(path.join(fixtures, name), "utf8"));

test("step 1 lists accounts then submits verified intake", () => {
  const calls = planStep1Onboarding(load("intake.txt"), { account_id: "acct_example" });
  assert.equal(calls[0].name, "list_accounts");
  assert.equal(calls[1].name, "submit_account");
  assert.equal(calls[2].name, "get_diagnosis");
  assert.equal(calls[1].args.platform, "Instagram");
});

test("step 2 does not confirm positioning without the customer's words", () => {
  const waiting = planStep2Positioning({ account_id: "acct_example" });
  assert.equal(waiting[0].name, "get_positioning");
  assert.equal(waiting[1].skipped, true);
  const confirmed = planStep2Positioning({
    account_id: "acct_example",
    version: 0,
    decision: "confirm",
    customer_words: "可以"
  });
  assert.equal(confirmed[1].name, "confirm_positioning");
  assert.equal(confirmed[1].args.customer_words, "可以");
});

test("step 3 prefers user-provided collections over recommendations", () => {
  const calls = planStep3Production({
    account_id: "acct_example",
    collections: [load("listing.txt"), load("story.txt")]
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((item) => item.name === "request_content" && item.args.intent === "produce"));
});

test("step 7 skips publication reporting until a public URL exists", () => {
  const blocked = planStep7Publication({ account_id: "acct_example", task_id: "task_example" });
  assert.equal(blocked[0].skipped, true);
  const ready = planStep7Publication({
    account_id: "acct_example",
    task_id: "task_example",
    url: "https://www.instagram.com/p/example"
  });
  assert.equal(ready[0].name, "report_publication");
});

test("target product flow has 11 documented steps and keeps unconfirmed work from starting", () => {
  assert.equal(STEPS.length, 11);
  assert.deepEqual(STEPS.map((item) => item.name), [
    "接入 MCP",
    "前置信息收集",
    "提出长期运营方案",
    "修改并确认长期方案",
    "讨论并确认前 5 期主题",
    "自动建立内容日历",
    "补齐本期必要信息",
    "展示本期制作方案",
    "制作与内部质检",
    "成片审核与交付",
    "复盘并推进下一轮"
  ]);
  const connect = planConnectMcp();
  assert.equal(connect[0].skipped, true);
  assert.match(connect[0].note, /Personal Agent/);

  const topics = planTopics({
    topics: {
      kind: "topics",
      record: {
        topics: [
          { id: "u1", title: "我想先做卖房准备", source: "user", confirmed: true, corePoint: "先整理再挂牌" },
          { id: "r1", title: "市场解读", confirmed: false }
        ]
      }
    },
    account_id: "acct_example"
  });
  assert.ok(topics.some((item) => item.skipped && /未确认/.test(item.note)));
  const produce = topics.filter((item) => item.name === "request_content");
  assert.equal(produce.length, 1);
  assert.equal(produce[0].args.idea, "我想先做卖房准备");

  const blockedPlan = planProductionPlan({ plan: { kind: "production_plan", record: { title: "第 1 期", confirmed: false } } });
  assert.equal(blockedPlan[0].skipped, true);
  assert.match(blockedPlan[0].note, /不跳过/);

  const calendar = planCalendar();
  assert.equal(calendar[0].skipped, true);
  assert.match(calendar[0].note, /尚未验证/);

  const gaps = planEpisodeGaps();
  assert.equal(gaps[0].surface, "conversation");
  assert.match(gaps[0].note, /不用表单|只在对话/);

  const review = planFilmReview({ review: { kind: "film_review", record: { decision: "approve" } } });
  assert.ok(review.some((item) => item.name === "report_publication" && item.skipped));
});
