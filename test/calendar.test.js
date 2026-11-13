import assert from "node:assert/strict";
import test from "node:test";
import { applyCalendarAdjustments, arrangeCalendar, parseCadence } from "../lib/calendar.js";

test("arrangeCalendar uses confirmed topics, order, and cadence", () => {
  assert.equal(parseCadence("每周2期").perWeek, 2);
  const calendar = arrangeCalendar({
    cadence: "每周2期",
    startDate: "2026-11-20",
    timezone: "America/Los_Angeles",
    topics: [
      { id: "a", title: "未确认不应入历", confirmed: false, order: 1 },
      { id: "b", title: "第一期", confirmed: true, order: 2 },
      { id: "c", title: "第二期", confirmed: true, order: 3 }
    ]
  });
  assert.equal(calendar.items.length, 2);
  assert.equal(calendar.items[0].title, "第一期");
  assert.equal(calendar.items[0].publishOn, "2026-11-20");
  assert.equal(calendar.items[1].publishOn, "2026-11-24");
  assert.ok(calendar.items[0].assetPrepOn);
  assert.ok(calendar.items[0].productionOn);
  assert.ok(calendar.items[0].reviewOn);
  assert.equal(calendar.platformSync, "unverified");
  const adjusted = applyCalendarAdjustments(calendar, [{ topicId: "b", publishOn: "2026-11-21", status: "in-production" }]);
  assert.equal(adjusted.items[0].publishOn, "2026-11-21");
  assert.equal(adjusted.items[0].status, "in-production");
});
