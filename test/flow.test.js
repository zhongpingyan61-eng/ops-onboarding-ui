import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCollection } from "../lib/parse.js";
import {
  planStep1Onboarding,
  planStep2Positioning,
  planStep3Production,
  planStep7Publication
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
