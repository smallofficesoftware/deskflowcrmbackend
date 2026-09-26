import assert from "node:assert/strict";
import { addDays, catchUpRange, dueDates, entryState, isDueOn, parseScheduleInput, parseWeekdays } from "./formBuilderSchedule.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

t("addDays crosses month and year ends", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

t("daily is due every day of the range", () => {
  const s = { frequency: "daily", start_date: "2026-09-01", end_date: null };
  assert.deepEqual(dueDates(s, "2026-09-01", "2026-09-04"), ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
});

t("weekly: only the chosen weekdays (0 = Sunday)", () => {
  // 2026-09-28 is a Monday
  const s = { frequency: "weekly", weekdays: [1, 4], start_date: "2026-09-01", end_date: null };
  assert.deepEqual(dueDates(s, "2026-09-28", "2026-10-04"), ["2026-09-28", "2026-10-01"]);
});

t("monthly: 31st falls on the last day of shorter months", () => {
  const s = { frequency: "monthly", day_of_month: 31, start_date: "2026-01-01", end_date: null };
  assert.deepEqual(dueDates(s, "2026-02-01", "2026-04-30"), ["2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.equal(isDueOn({ frequency: "monthly", day_of_month: 15 }, "2026-05-15"), true);
  assert.equal(isDueOn({ frequency: "monthly", day_of_month: 15 }, "2026-05-16"), false);
});

t("start and end dates limit the range", () => {
  const s = { frequency: "daily", start_date: "2026-09-10", end_date: "2026-09-12" };
  assert.deepEqual(dueDates(s, "2026-09-01", "2026-09-30"), ["2026-09-10", "2026-09-11", "2026-09-12"]);
});

t("catch-up: from the day after the last generated day to today", () => {
  const s = { start_date: "2026-09-01", end_date: null, last_generated_date: "2026-09-10" };
  assert.deepEqual(catchUpRange(s, "2026-09-14"), { from: "2026-09-11", to: "2026-09-14" });
  assert.equal(catchUpRange({ ...s, last_generated_date: "2026-09-14" }, "2026-09-14"), null);
});

t("catch-up: first run starts at the start date, but never more than 62 days back", () => {
  assert.deepEqual(catchUpRange({ start_date: "2026-09-10", end_date: null, last_generated_date: null }, "2026-09-12"), { from: "2026-09-10", to: "2026-09-12" });
  const old = catchUpRange({ start_date: "2020-01-01", end_date: null, last_generated_date: null }, "2026-09-26");
  assert.equal(old.from, addDays("2026-09-26", -62));
});

t("catch-up: a schedule that has not started or has ended", () => {
  assert.equal(catchUpRange({ start_date: "2026-10-01", end_date: null, last_generated_date: null }, "2026-09-26"), null);
  assert.deepEqual(catchUpRange({ start_date: "2026-09-01", end_date: "2026-09-20", last_generated_date: "2026-09-15" }, "2026-09-26"), { from: "2026-09-16", to: "2026-09-20" });
});

t("entry state: done, due today, missed", () => {
  assert.equal(entryState({ due_date: "2026-09-20", submission_id: 5 }, "2026-09-26"), "done");
  assert.equal(entryState({ due_date: "2026-09-26", submission_id: null }, "2026-09-26"), "due");
  assert.equal(entryState({ due_date: "2026-09-25", submission_id: null }, "2026-09-26"), "missed");
});

t("input check: plain messages", () => {
  const ok = parseScheduleInput({ title: " Daily check ", frequency: "weekly", weekdays: [3, 1, 1], assignee_login_ids: [4, "5", 4], start_date: "2026-09-01" });
  assert.deepEqual(ok.value, {
    title: "Daily check",
    frequency: "weekly",
    weekdays: [1, 3],
    day_of_month: null,
    assignee_login_ids: [4, 5],
    start_date: "2026-09-01",
    end_date: null,
  });
  assert.ok(parseScheduleInput({ title: "", frequency: "daily" }).error);
  assert.ok(/weekday/.test(parseScheduleInput({ title: "x", frequency: "weekly", weekdays: [], assignee_login_ids: [1], start_date: "2026-09-01" }).error));
  assert.ok(/day of the month/.test(parseScheduleInput({ title: "x", frequency: "monthly", assignee_login_ids: [1], start_date: "2026-09-01" }).error));
  assert.ok(/at least one person/.test(parseScheduleInput({ title: "x", frequency: "daily", assignee_login_ids: [], start_date: "2026-09-01" }).error));
  assert.ok(/before the start/.test(parseScheduleInput({ title: "x", frequency: "daily", assignee_login_ids: [1], start_date: "2026-09-05", end_date: "2026-09-01" }).error));
});

t("weekday text round trip", () => {
  assert.deepEqual(parseWeekdays("1,3,5"), [1, 3, 5]);
  assert.deepEqual(parseWeekdays(null), []);
});

console.log(`\n${passed} passed`);
