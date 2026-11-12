import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { detectKind, filled, parseCollection } from "../lib/parse.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../examples/fixtures");
const read = (name) => fs.readFileSync(path.join(fixtures, name), "utf8");

test("parses intake plaintext and keeps unverified area empty for later judgment", () => {
  const text = read("intake.txt");
  assert.equal(detectKind(text), "intake");
  const parsed = parseCollection(text);
  assert.equal(parsed.record.account, "Instagram · riverside_homes（待授权）");
  assert.equal(parsed.record.audiences, "第一次买房的人、准备卖房的业主");
  assert.equal(parsed.record.coverage, "全球不限");
  assert.equal(parsed.record.area, "暂未填写，方案里再判断");
  assert.equal(filled(parsed.record.area), false);
  assert.equal(parsed.record.displayName, "Alex Rivera");
});

test("parses listing plaintext including this-piece override", () => {
  const parsed = parseCollection(read("listing.txt"));
  assert.equal(parsed.kind, "listing_materials");
  assert.deepEqual(parsed.record.urls, ["https://www.zillow.com/homedetails/example"]);
  assert.equal(parsed.record.showAgent, "是");
  assert.deepEqual(parsed.record.shownLabels, ["姓名", "电话"]);
  assert.equal(parsed.record.displayPhone, "(951) 555-0199");
  assert.deepEqual(parsed.record.overrides, ["电话"]);
});

test("parses story and bio files and links", () => {
  const story = parseCollection(read("story.txt"));
  assert.equal(story.kind, "deal_story");
  assert.equal(story.record.dealType, "帮业主卖出");
  assert.deepEqual(story.record.files, [
    { name: "kitchen.jpg", kind: "图片" },
    { name: "closing-notes.pdf", kind: "PDF" }
  ]);
  const bio = parseCollection(read("bio.txt"));
  assert.equal(bio.kind, "bio");
  assert.equal(bio.record.who, "个人");
  assert.equal(bio.record.files[1].kind, "文档");
});

test("accepts already structured JSON", () => {
  const parsed = parseCollection({
    kind: "bio",
    record: { topic: "个人或团队介绍", who: "团队", links: [], files: [], intro: "hello" },
    plaintext: "x"
  });
  assert.equal(parsed.kind, "bio");
  assert.equal(parsed.record.who, "团队");
});
