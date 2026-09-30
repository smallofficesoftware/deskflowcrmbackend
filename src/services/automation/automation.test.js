// Dependency-free self-test for the pure parts of the Automations engine:
// conditions, {{ }} templates, validation, trigger filters, schedule keys,
// business / quiet hours. No DB. Run directly:
//
//   node src/services/automation/automation.test.js
//
// (Same approach as form_builder/formBuilderDdlBuilder.test.js - the repo has
// no test framework.)
import assert from "assert";
import moment from "moment";
import { buildCatalog, catalogGaps, handlerGaps } from "./catalog.js";
import { evaluateRule, evaluateRules } from "./conditions.js";
import { getPath, redact, resolveDeep, resolveTemplate } from "./context.js";
import { scheduleKey } from "./cronTriggers.js";
import { passesOriginRules, passesTypeFilters } from "./triggers.js";
import { addDuration, nextBusinessMoment, quietHoursEnd } from "./time.js";
import { AUTOMATION_TEMPLATES, getTemplate, listTemplates } from "./templates.js";
import { businessHoursOrNull, numOrNull, timeOrNull, timezoneOr } from "./settingsSanitize.js";
import { describeLimit, limitsFromDataLimit, parseDataLimit } from "./planLimit.js";
import { validateFlow } from "./validate.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL - ${name}\n    ${e.message}`);
  }
}

// ---------------------------------------------------------------- context
test("getPath reads nested values and tolerates gaps", () => {
  assert.strictEqual(getPath({ a: { b: 3 } }, "a.b"), 3);
  assert.strictEqual(getPath({ a: null }, "a.b"), undefined);
  assert.strictEqual(getPath({}, ""), undefined);
});
test("resolveTemplate keeps type for a single placeholder, stringifies mixed text", () => {
  const ctx = { contact: { name: "Asha", n: 5 }, missing: undefined };
  assert.strictEqual(resolveTemplate("{{contact.n}}", ctx), 5);
  assert.strictEqual(resolveTemplate("Hi {{ contact.name }}!", ctx), "Hi Asha!");
  assert.strictEqual(resolveTemplate("Hi {{contact.nope}}!", ctx), "Hi !");
  assert.strictEqual(resolveTemplate("{{contact.nope}}", ctx), "");
});
test("resolveDeep resolves inside arrays and objects", () => {
  const out = resolveDeep({ a: ["{{x}}", { b: "{{x}}-1" }] }, { x: "7" });
  assert.deepStrictEqual(out, { a: ["7", { b: "7-1" }] });
});
test("redact hides secrets at any depth", () => {
  const out = redact({ user: "a", auth_password: "p", nested: { api_key: "k", ok: 1 }, list: [{ token: "t" }] });
  assert.strictEqual(out.auth_password, "***");
  assert.strictEqual(out.nested.api_key, "***");
  assert.strictEqual(out.list[0].token, "***");
  assert.strictEqual(out.user, "a");
});

// ---------------------------------------------------------------- conditions
test("string operators are case-insensitive", () => {
  const ctx = { record: { name: "Asha Traders" } };
  assert.ok(evaluateRule({ field: "record.name", operator: "contains", value: "traders" }, ctx));
  assert.ok(evaluateRule({ field: "record.name", operator: "starts_with", value: "asha" }, ctx));
  assert.ok(!evaluateRule({ field: "record.name", operator: "equals", value: "asha" }, ctx));
});
test("numeric operators", () => {
  const ctx = { record: { grand_total: "1500.50" } };
  assert.ok(evaluateRule({ field: "record.grand_total", operator: "greater_than", value: 1000 }, ctx));
  assert.ok(!evaluateRule({ field: "record.grand_total", operator: "less_than", value: 1000 }, ctx));
  assert.ok(!evaluateRule({ field: "record.missing", operator: "greater_than", value: 1 }, ctx), "NaN must not match");
});
test("empty / in / contains_any", () => {
  const ctx = { record: { a: "", b: "x", c: "red,blue" } };
  assert.ok(evaluateRule({ field: "record.a", operator: "is_empty" }, ctx));
  assert.ok(evaluateRule({ field: "record.b", operator: "is_not_empty" }, ctx));
  assert.ok(evaluateRule({ field: "record.b", operator: "in", value: "x, y" }, ctx));
  assert.ok(evaluateRule({ field: "record.c", operator: "contains_any", value: "green,blue" }, ctx));
});
test("rule value can use {{ }}", () => {
  assert.ok(evaluateRule({ field: "record.a", operator: "equals", value: "{{vars.want}}" }, { record: { a: "9" }, vars: { want: "9" } }));
});
test("changed / changed_to / changed_from use before + changed_fields", () => {
  const ctx = { record: { contact_status: "3" }, before: { contact_status: "1" }, changed_fields: ["contact_status"] };
  assert.ok(evaluateRule({ field: "record.contact_status", operator: "changed" }, ctx));
  assert.ok(evaluateRule({ field: "record.contact_status", operator: "changed_to", value: "3" }, ctx));
  assert.ok(evaluateRule({ field: "record.contact_status", operator: "changed_from", value: "1" }, ctx));
  assert.ok(!evaluateRule({ field: "record.person_name", operator: "changed" }, ctx));
});
test("unknown operator never matches; AND / OR / empty", () => {
  const ctx = { record: { a: 1 } };
  assert.ok(!evaluateRule({ field: "record.a", operator: "nope", value: 1 }, ctx));
  const yes = { field: "record.a", operator: "equals", value: 1 };
  const no = { field: "record.a", operator: "equals", value: 2 };
  assert.ok(evaluateRules([yes, no], "OR", ctx));
  assert.ok(!evaluateRules([yes, no], "AND", ctx));
  assert.ok(evaluateRules([], "AND", ctx));
  assert.ok(evaluateRules(undefined, undefined, ctx));
});

// ---------------------------------------------------------------- validation
const node = (id, type, parameters = {}) => ({ id, type, parameters });
const goodFlow = () => ({
  name: "Welcome",
  trigger_type: "contact.created",
  trigger_config: {},
  nodes: [node("t", "trigger"), node("m", "send_whatsapp", { message: "Hi {{contact.person_name}}" })],
  connections: [{ id: "c1", source: "t", target: "m", sourceHandle: "src" }],
});
test("a complete flow validates", () => {
  assert.deepStrictEqual(validateFlow(goodFlow(), { complete: true }), []);
});
test("draft allows missing required fields, active does not", () => {
  const f = goodFlow();
  f.nodes[1].parameters = {};
  assert.deepStrictEqual(validateFlow(f, { complete: false }), []);
  assert.ok(validateFlow(f, { complete: true }).some((e) => /Message/.test(e)));
});
test("showIf hides required fields that do not apply", () => {
  const f = goodFlow();
  f.nodes[1].parameters = { message: "x", mode: "text" }; // media_url only required when mode = media
  assert.deepStrictEqual(validateFlow(f, { complete: true }), []);
  f.nodes[1].parameters = { message: "x", mode: "media" };
  assert.ok(validateFlow(f, { complete: true }).some((e) => /File link/.test(e)));
});
test("needs exactly one trigger, known trigger type and known steps", () => {
  const f = goodFlow();
  f.nodes.push(node("t2", "trigger"));
  assert.ok(validateFlow(f).some((e) => /exactly one trigger/.test(e)));
  const g = goodFlow();
  g.trigger_type = "nope";
  assert.ok(validateFlow(g).some((e) => /Pick a trigger/.test(e)));
  const h = goodFlow();
  h.nodes[1].type = "teleport";
  assert.ok(validateFlow(h).some((e) => /Unknown step/.test(e)));
});
test("connections must point at real steps; nothing connects into the trigger", () => {
  const f = goodFlow();
  f.connections.push({ id: "c2", source: "m", target: "ghost", sourceHandle: "src" });
  assert.ok(validateFlow(f).some((e) => /does not exist/.test(e)));
  const g = goodFlow();
  g.connections.push({ id: "c3", source: "m", target: "t", sourceHandle: "src" });
  assert.ok(validateFlow(g).some((e) => /back into the trigger|loop/.test(e)));
});
test("loops are rejected", () => {
  const f = goodFlow();
  f.nodes.push(node("n", "stop"));
  f.connections.push({ id: "c2", source: "m", target: "n", sourceHandle: "src" }, { id: "c3", source: "n", target: "m", sourceHandle: "src" });
  assert.ok(validateFlow(f).some((e) => /loop/.test(e)));
});
test("unconnected steps are reported when complete", () => {
  const f = goodFlow();
  f.nodes.push(node("x", "stop"));
  assert.ok(validateFlow(f, { complete: true }).some((e) => /not connected/.test(e)));
});
test("webhook_response only with the incoming webhook trigger", () => {
  const f = goodFlow();
  f.nodes.push(node("w", "webhook_response", { status_code: 200 }));
  assert.ok(validateFlow(f).some((e) => /Incoming webhook/.test(e)));
  f.trigger_type = "webhook.received";
  assert.ok(!validateFlow(f).some((e) => /Incoming webhook/.test(e)));
});
test("trigger required config is enforced when complete", () => {
  const f = goodFlow();
  f.trigger_type = "contact.special_date";
  assert.ok(validateFlow(f, { complete: true }).some((e) => /Date field/.test(e)));
});
test("every catalog step has a handler and vice versa", () => {
  assert.deepStrictEqual(catalogGaps(), []);
  assert.deepStrictEqual(handlerGaps(), []);
  const c = buildCatalog();
  assert.ok(c.triggers.length > 20 && c.nodes.length > 20);
});

// ---------------------------------------------------------------- settings sanitising
test("timeOrNull accepts real clock times only, normalised to HH:MM", () => {
  assert.strictEqual(timeOrNull("9:05"), "09:05");
  assert.strictEqual(timeOrNull("21:00"), "21:00");
  for (const bad of ["99:99", "24:00", "12:60", "nope", "", null, undefined, "12", "1:2"]) assert.strictEqual(timeOrNull(bad), null, String(bad));
});
test("numOrNull keeps positive whole numbers, drops junk / zero / negatives", () => {
  assert.strictEqual(numOrNull("20"), 20);
  assert.strictEqual(numOrNull(20.9), 20);
  for (const bad of ["abc", -5, 0, "", null, undefined, NaN]) assert.strictEqual(numOrNull(bad), null, String(bad));
});
test("timezoneOr keeps +HH:MM offsets, falls back otherwise", () => {
  assert.strictEqual(timezoneOr("+05:30"), "+05:30");
  assert.strictEqual(timezoneOr("-08:00"), "-08:00");
  for (const bad of ["IST", "+25:00", "+05:99", "", null]) assert.strictEqual(timezoneOr(bad), "+05:30", String(bad));
});
test("businessHoursOrNull needs valid from/to; cleans the days list", () => {
  assert.deepStrictEqual(businessHoursOrNull({ from: "9:30", to: "18:30", days: [1, 2, 2, 9, 0, "3"] }), { days: [1, 2, 3], from: "09:30", to: "18:30" });
  assert.deepStrictEqual(businessHoursOrNull({ from: "09:00", to: "17:00" }).days, [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(businessHoursOrNull({ from: "99:99", to: "17:00" }), null);
  assert.strictEqual(businessHoursOrNull(null), null);
});

// ---------------------------------------------------------------- plan limit (plan_vs_pages.data_limit)
test("parseDataLimit reads the CRM's data_limit strings (plain, comma, Indian grouping)", () => {
  assert.strictEqual(parseDataLimit("5"), 5);
  assert.strictEqual(parseDataLimit("10,000"), 10000);
  assert.strictEqual(parseDataLimit("1,00,000"), 100000);
  assert.strictEqual(parseDataLimit(" 25 "), 25);
  assert.strictEqual(parseDataLimit(7), 7);
  assert.strictEqual(parseDataLimit("12.9"), 12);
});
test('parseDataLimit: "0", empty, junk and negatives mean no limit (the CRM default for every page is "0")', () => {
  for (const v of ["0", "", "  ", "abc", "-3", null, undefined, 0, NaN]) assert.strictEqual(parseDataLimit(v), null, String(v));
});
test("limitsFromDataLimit: runs per month scale with the flow limit; no limit = unlimited both", () => {
  assert.deepStrictEqual(limitsFromDataLimit("5"), { max_active_flows: 5, max_runs_per_month: 2000 });
  assert.deepStrictEqual(limitsFromDataLimit("25"), { max_active_flows: 25, max_runs_per_month: 10000 });
  assert.deepStrictEqual(limitsFromDataLimit("0"), { max_active_flows: null, max_runs_per_month: null });
  assert.strictEqual(describeLimit(null), "unlimited");
  assert.strictEqual(describeLimit(5), "5");
});

// ---------------------------------------------------------------- templates
test("every template is a structurally valid draft (real trigger, known steps, connected, no loops)", () => {
  assert.ok(AUTOMATION_TEMPLATES.length >= 9);
  for (const t of AUTOMATION_TEMPLATES) {
    const errors = validateFlow({ name: t.name, trigger_type: t.trigger_type, trigger_config: t.trigger_config, nodes: t.nodes, connections: t.connections }, { complete: false });
    assert.deepStrictEqual(errors, [], `${t.key}: ${errors.join("; ")}`);
  }
});
test("templates have unique keys; the list hides nodes and counts steps", () => {
  const keys = AUTOMATION_TEMPLATES.map((t) => t.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  const list = listTemplates();
  assert.strictEqual(list.length, keys.length);
  assert.ok(list.every((t) => !("nodes" in t) && t.step_count >= 1));
  assert.strictEqual(getTemplate("nope"), null);
});
test("templates are only missing what the user must supply (people / a date field), nothing else", () => {
  const allowedMissing = /Assign to|Team members|Team member|For|Date field/;
  for (const t of AUTOMATION_TEMPLATES) {
    const errors = validateFlow({ name: t.name, trigger_type: t.trigger_type, trigger_config: t.trigger_config, nodes: t.nodes, connections: t.connections }, { complete: true });
    for (const e of errors) assert.ok(allowedMissing.test(e), `${t.key}: unexpected problem "${e}"`);
  }
});

// ---------------------------------------------------------------- trigger filters
test("cart type filter", () => {
  const flow = { trigger_config: { cart_types: [3] } };
  assert.ok(passesTypeFilters(flow, { type: "cart.created", record_type: "cart", record: { type: 3 } }));
  assert.ok(!passesTypeFilters(flow, { type: "cart.created", record_type: "cart", record: { type: 1 } }));
});
test("status from / to filter", () => {
  const flow = { trigger_config: { status_from: ["1"], status_to: ["3"] } };
  const ev = (from, to) => ({ type: "contact.status_changed", record_type: "contact", record: {}, status: { from, to } });
  assert.ok(passesTypeFilters(flow, ev(1, 3)));
  assert.ok(!passesTypeFilters(flow, ev(2, 3)));
  assert.ok(!passesTypeFilters(flow, ev(1, 4)));
});
test("updated trigger fires only for the picked fields", () => {
  const flow = { trigger_config: { fields: ["email_id"] } };
  assert.ok(passesTypeFilters(flow, { type: "contact.updated", record_type: "contact", record: {}, changed_fields: ["email_id"] }));
  assert.ok(!passesTypeFilters(flow, { type: "contact.updated", record_type: "contact", record: {}, changed_fields: ["address"] }));
});
test("WhatsApp keyword modes", () => {
  const mk = (mode, keywords, text) => passesTypeFilters({ trigger_config: { keyword_mode: mode, keywords } }, { type: "whatsapp.received", record_type: "whatsapp", record: { description: text } });
  assert.ok(mk("any", "", "hello"));
  assert.ok(mk("exact", "price, rate", "Price"));
  assert.ok(!mk("exact", "price", "price list"));
  assert.ok(mk("contains", "price", "send price list"));
  assert.ok(mk("starts_with", "hi", "Hi there"));
  assert.ok(!mk("starts_with", "hi", "oh hi"));
});
test("task vs ticket filter", () => {
  const ev = (t) => ({ type: "task.created", record_type: "task", record: { is_support_ticket: t } });
  assert.ok(passesTypeFilters({ trigger_config: { task_kind: "ticket" } }, ev(1)));
  assert.ok(!passesTypeFilters({ trigger_config: { task_kind: "ticket" } }, ev(0)));
  assert.ok(!passesTypeFilters({ trigger_config: { task_kind: "task" } }, ev(1)));
});
test("imported records are skipped unless the flow opts in (13.4)", () => {
  assert.ok(!passesOriginRules({ include_imported_records: 0 }, { origin: "import" }));
  assert.ok(passesOriginRules({ include_imported_records: 1 }, { origin: "import" }));
  assert.ok(passesOriginRules({ include_imported_records: 0 }, { origin: "user" }));
});
test("automation-made changes: opt-in, depth cap 3, never the same flow twice (13.7)", () => {
  const ctx = (depth, flows = []) => ({ origin: "automation", chain_depth: depth, source_flow_ids: flows });
  assert.ok(!passesOriginRules({ id: 1, allow_automation_trigger: 0 }, ctx(1)));
  assert.ok(passesOriginRules({ id: 1, allow_automation_trigger: 1 }, ctx(2)));
  assert.ok(!passesOriginRules({ id: 1, allow_automation_trigger: 1 }, ctx(3)));
  assert.ok(!passesOriginRules({ id: 1, allow_automation_trigger: 1 }, ctx(1, [1])));
});

// ---------------------------------------------------------------- schedule keys
test("schedule keys: daily fires once per date and only after the set time", () => {
  const cfg = { frequency: "daily", time: "09:30" };
  const day = (t) => moment(`2026-09-26 ${t}`, "YYYY-MM-DD HH:mm");
  assert.strictEqual(scheduleKey(cfg, day("09:29")), null);
  assert.strictEqual(scheduleKey(cfg, day("09:30")), "d2026-09-26");
  assert.strictEqual(scheduleKey(cfg, day("18:00")), "d2026-09-26");
});
test("schedule keys: weekly and monthly (month-end clamp)", () => {
  const sat = moment("2026-09-26 10:00", "YYYY-MM-DD HH:mm"); // ISO weekday 6
  assert.ok(scheduleKey({ frequency: "weekly", weekday: 6, time: "09:00" }, sat));
  assert.strictEqual(scheduleKey({ frequency: "weekly", weekday: 1, time: "09:00" }, sat), null);
  const feb = moment("2026-02-28 10:00", "YYYY-MM-DD HH:mm");
  assert.strictEqual(scheduleKey({ frequency: "monthly", day_of_month: 31, time: "09:00" }, feb), "M2026-02");
  assert.strictEqual(scheduleKey({ frequency: "monthly", day_of_month: 15, time: "09:00" }, feb), null);
});
test("schedule keys: every N minutes changes bucket every N minutes", () => {
  const aligned = moment(Math.floor(Date.now() / 300000) * 300000); // start of a 5-minute bucket
  const key = scheduleKey({ frequency: "minutes", every: 5 }, aligned);
  assert.strictEqual(scheduleKey({ frequency: "minutes", every: 5 }, aligned.clone().add(4, "minutes")), key);
  assert.notStrictEqual(scheduleKey({ frequency: "minutes", every: 5 }, aligned.clone().add(5, "minutes")), key);
});

// ---------------------------------------------------------------- time helpers
test("addDuration adds the requested unit", () => {
  const d = addDuration(2, "hours");
  const diff = d.getTime() - Date.now();
  assert.ok(diff > 2 * 3600 * 1000 - 5000 && diff < 2 * 3600 * 1000 + 5000);
  assert.ok(addDuration(1, "days").getTime() - Date.now() > 23 * 3600 * 1000);
});
test("business hours: no config = never held; closed window = next opening", () => {
  assert.strictEqual(nextBusinessMoment({}), null);
  const closedAlways = { business_hours: { days: [1, 2, 3, 4, 5, 6, 7], from: "23:59", to: "23:59" }, timezone: "+05:30" };
  const at = nextBusinessMoment(closedAlways);
  assert.ok(at && at.hours() === 23 && at.minutes() === 59 && at.isAfter(moment()));
});
test("quiet hours: empty / equal window means none; inside the window returns when it ends", () => {
  assert.strictEqual(quietHoursEnd({}), null);
  assert.strictEqual(quietHoursEnd({ quiet_hours_from: "21:00", quiet_hours_to: "21:00" }), null);
  const now = moment().utcOffset("+05:30");
  const from = now.clone().subtract(1, "hours").format("HH:mm");
  const to = now.clone().add(1, "hours").format("HH:mm");
  const end = quietHoursEnd({ quiet_hours_from: from, quiet_hours_to: to, timezone: "+05:30" });
  assert.ok(end && end.isAfter(moment()), "inside the window -> returns when it ends");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
