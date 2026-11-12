import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCollection } from "../lib/parse.js";
import {
  toReportPublication,
  toRequestContent,
  toSubmitAccount
} from "../lib/mcp-payloads.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../examples/fixtures");
const load = (name) => parseCollection(fs.readFileSync(path.join(fixtures, name), "utf8"));

test("submit_account sends verified fields only and does not treat 全球不限 as a service region", () => {
  const args = toSubmitAccount(load("intake.txt"));
  assert.equal(args.platform, "Instagram");
  assert.equal(args.name, "riverside_homes");
  assert.equal(args.language, "English");
  assert.equal(args.audience, "第一次买房的人、准备卖房的业主");
  assert.equal(args.intake.audience, "第一次买房的人、准备卖房的业主");
  assert.equal(args.intake.experience, "房产经纪人");
  assert.equal(args.intake.region, undefined);
  assert.ok(!JSON.stringify(args).includes("全球不限"));
  assert.ok(!JSON.stringify(args).includes("Alex Rivera"), "display profile is not a login or account name");
});

test("request_content maps user-chosen collections to produce payloads", () => {
  const listing = toRequestContent(load("listing.txt"), { account_id: "acct_example" });
  assert.equal(listing.intent, "produce");
  assert.equal(listing.source_url, "https://www.zillow.com/homedetails/example");
  assert.equal(listing.idea, "房源展示");
  const story = toRequestContent(load("story.txt"), { account_id: "acct_example" });
  assert.equal(story.format, "轮播");
  const bio = toRequestContent(load("bio.txt"), { account_id: "acct_example" });
  assert.equal(bio.format, "图文");
  assert.match(bio.agent_summary, /原文件/);
});

test("report_publication requires a real public URL", () => {
  assert.throws(
    () => toReportPublication({ account_id: "acct_example", task_id: "task_example" }),
    /交付不等于发布/
  );
  const args = toReportPublication({
    account_id: "acct_example",
    task_id: "task_example",
    url: "https://www.instagram.com/p/example"
  });
  assert.equal(args.url, "https://www.instagram.com/p/example");
});
