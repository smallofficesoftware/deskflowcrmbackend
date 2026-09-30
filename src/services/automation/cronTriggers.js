import { QueryTypes } from "sequelize";
import { evaluateRules } from "./conditions.js";
import { RECORD_TYPE_TO_TABLE } from "./constants.js";
import { nowIn } from "./time.js";

// Finders for the trigger types that no service emits (plan section 2:
// "found by the automation cron"). Each finder returns due items:
//   [{ record_type, id, period_key, record?, extra? }]
// The scheduler claims a run mark per (flow, record, period_key) so an item
// fires once per period, then starts the run.
//
// Guards so activating a flow does not blast old data:
//   trigger_config.lookback_days   due-type triggers only look back this far (default 2)
//   trigger_config.max_per_day     runs per flow per day from the cron (default 200, max 2000)

const IDENT = /^[a-z_][a-z0-9_]*$/i;
const MAX_ROWS = 500;

const q = (tenantDB, sql, replacements) =>
  tenantDB.query(sql, { replacements, type: QueryTypes.SELECT });

const table = (recordType) => {
  const t = RECORD_TYPE_TO_TABLE[recordType];
  if (!t) throw new Error(`Unsupported record type "${recordType}"`);
  return t;
};

const atOrAfter = (now, hhmm) => {
  if (!hhmm) return true;
  const [h, m] = String(hhmm).split(":").map(Number);
  return now.hours() * 60 + now.minutes() >= (h || 0) * 60 + (m || 0);
};

const lookback = (cfg) => Math.min(Math.max(Number(cfg.lookback_days) || 2, 1), 90);
const dateStr = (m) => m.format("YYYY-MM-DD");

/** "when" = before | on | after, "days" = N  ->  the calendar date a record's date must equal today. */
const targetDate = (now, when, days) => {
  const n = Math.abs(Number(days) || 0);
  if (when === "before") return now.clone().add(n, "days");
  if (when === "after") return now.clone().subtract(n, "days");
  return now.clone();
};

// ---------------------------------------------------------------- schedule

export const scheduleKey = (cfg, now) => {
  const every = Math.max(Number(cfg.every) || 1, 1);
  switch (cfg.frequency || "daily") {
    case "minutes":
      return `m${Math.floor(now.valueOf() / 60000 / every)}`;
    case "hourly":
      return `h${Math.floor(now.valueOf() / 3600000 / every)}`;
    case "weekly":
      return now.isoWeekday() === (Number(cfg.weekday) || 1) && atOrAfter(now, cfg.time) ? `w${now.format("GGGG-WW")}` : null;
    case "monthly": {
      const day = Math.min(Number(cfg.day_of_month) || 1, now.daysInMonth());
      return now.date() === day && atOrAfter(now, cfg.time) ? `M${now.format("YYYY-MM")}` : null;
    }
    default:
      return atOrAfter(now, cfg.time) ? `d${dateStr(now)}` : null;
  }
};

// T15.1 config: frequency, every, time, weekday, day_of_month,
//               record_type + rules + match (optional: one run per matching record)
const schedule = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  const key = scheduleKey(cfg, now);
  if (!key) return [];
  if (!cfg.record_type) return [{ record_type: "flow", id: flow.id, period_key: key, standalone: true }];
  const rows = await q(
    tenantDB,
    `SELECT * FROM \`${table(cfg.record_type)}\` WHERE \`isDelete\` = 0 AND \`company_masters_id\` = ? LIMIT ${MAX_ROWS}`,
    [flow.company_masters_id]
  );
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: cfg.record_type, id: r.id, period_key: key, record: r }));
};

// T15.2 config: record_type, field, when before|on|after, days, time, rules
const date_field = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  if (!IDENT.test(String(cfg.field))) throw new Error("Pick a date field");
  if (!atOrAfter(now, cfg.time)) return [];
  const on = dateStr(targetDate(now, cfg.when, cfg.days));
  const rows = await q(
    tenantDB,
    `SELECT * FROM \`${table(cfg.record_type)}\` WHERE \`isDelete\` = 0 AND \`company_masters_id\` = ? AND DATE(\`${cfg.field}\`) = ? LIMIT ${MAX_ROWS}`,
    [flow.company_masters_id, on]
  );
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: cfg.record_type, id: r.id, period_key: `${cfg.when || "on"}${cfg.days || 0}:${on}`, record: r }));
};

// T1.8 config: field (contact date column), time. Yearly on month-day.
const contact_special_date = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  if (!IDENT.test(String(cfg.field))) throw new Error("Pick a date field");
  if (!atOrAfter(now, cfg.time)) return [];
  const rows = await q(
    tenantDB,
    `SELECT * FROM \`contact_masters\` WHERE \`isDelete\` = 0 AND \`company_masters_id\` = ? AND DATE_FORMAT(\`${cfg.field}\`, '%m-%d') = ? LIMIT ${MAX_ROWS}`,
    [flow.company_masters_id, now.format("MM-DD")]
  );
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: "contact", id: r.id, period_key: `y${now.format("YYYY")}`, record: r }));
};

// T1.9 config: days, require_no ["order","inquiry"], repeat_days
const contact_inactive = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  const days = Math.max(Number(cfg.days) || 30, 1);
  const need = new Set(cfg.require_no?.length ? cfg.require_no : ["order", "inquiry"]);
  const since = dateStr(now.clone().subtract(days, "days"));
  const parts = [];
  if (need.has("order")) {
    parts.push(
      "NOT EXISTS (SELECT 1 FROM `carts` k WHERE k.`isDelete` = 0 AND k.`to_customer_id` = c.`id` AND k.`type` IN (2, 3) AND k.`cart_date` >= :since)"
    );
  }
  if (need.has("inquiry")) {
    parts.push(
      "NOT EXISTS (SELECT 1 FROM `inquiries` i WHERE i.`isDelete` = 0 AND i.`contact_master_id` = c.`id` AND i.`create_date_time` >= :since)"
    );
  }
  const rows = await q(
    tenantDB,
    `SELECT c.* FROM \`contact_masters\` c WHERE c.\`isDelete\` = 0 AND c.\`company_masters_id\` = :company ` +
      `AND c.\`created_date_time\` < :since ${parts.length ? `AND ${parts.join(" AND ")}` : ""} LIMIT ${MAX_ROWS}`,
    { company: flow.company_masters_id, since }
  );
  const repeat = Math.max(Number(cfg.repeat_days) || days, 1);
  const period = `r${Math.floor(now.valueOf() / 86400000 / repeat)}`;
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: "contact", id: r.id, period_key: period, record: r }));
};

// T3.1 config: days, cart_types (default [1]) - quotation not converted in X days
const cart_not_converted = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  const days = Math.max(Number(cfg.days) || 3, 1);
  const types = (cfg.cart_types?.length ? cfg.cart_types : [1]).map(Number).filter(Boolean);
  const from = now.clone().subtract(days + lookback(cfg), "days").format("YYYY-MM-DD HH:mm:ss");
  const to = now.clone().subtract(days, "days").format("YYYY-MM-DD HH:mm:ss");
  const rows = await q(
    tenantDB,
    "SELECT c.* FROM `carts` c WHERE c.`isDelete` = 0 AND c.`company_masters_id` = :company AND c.`type` IN (:types) " +
      "AND c.`created_date_time` BETWEEN :from AND :to " +
      `AND NOT EXISTS (SELECT 1 FROM \`carts\` n WHERE n.\`isDelete\` = 0 AND n.\`referance_cart_id\` = c.\`id\`) LIMIT ${MAX_ROWS}`,
    { company: flow.company_masters_id, types, from, to }
  );
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: "cart", id: r.id, period_key: `nc${days}`, record: r }));
};

// T3.4 config: cart_types (default [3]), when before|on|after, days, time
const cart_due = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  if (!atOrAfter(now, cfg.time)) return [];
  const types = (cfg.cart_types?.length ? cfg.cart_types : [3]).map(Number).filter(Boolean);
  const on = dateStr(targetDate(now, cfg.when || "after", cfg.days));
  const rows = await q(
    tenantDB,
    "SELECT * FROM `carts` WHERE `isDelete` = 0 AND `company_masters_id` = :company AND `type` IN (:types) AND `due_date` = :on " +
      `LIMIT ${MAX_ROWS}`,
    { company: flow.company_masters_id, types, on }
  );
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: "cart", id: r.id, period_key: `due${cfg.when || "after"}${cfg.days || 0}`, record: r }));
};

// T6.5 config: min_amount, days_without_payment, repeat_days
// Receivable = SUM(amount_signed) >= min (account_outstanding_view, same as the CRM's own reports);
// "no payment" = no credit (type 1) transaction in the last N days.
const payment_overdue = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  const days = Math.max(Number(cfg.days_without_payment) || 15, 1);
  const min = Math.max(Number(cfg.min_amount) || 1, 0.01);
  const since = now.clone().subtract(days, "days").format("YYYY-MM-DD HH:mm:ss");
  const rows = await q(
    tenantDB,
    "SELECT v.`contact_masters_id` AS id, SUM(v.`amount_signed`) AS outstanding FROM `account_outstanding_view` v " +
      "WHERE v.`company_masters_id` = :company AND v.`contact_masters_id` IS NOT NULL GROUP BY v.`contact_masters_id` " +
      "HAVING SUM(v.`amount_signed`) >= :min " +
      "AND SUM(CASE WHEN v.`type` = 1 AND v.`payment_date_time` >= :since THEN 1 ELSE 0 END) = 0 " +
      `LIMIT ${MAX_ROWS}`,
    { company: flow.company_masters_id, min, since }
  );
  const repeat = Math.max(Number(cfg.repeat_days) || days, 1);
  const period = `o${Math.floor(now.valueOf() / 86400000 / repeat)}`;
  return rows.map((r) => ({ record_type: "contact", id: r.id, period_key: period, extra: { outstanding: Number(r.outstanding) } }));
};

// T7.4 config: hours_overdue, task_kind task|ticket|any
const task_overdue = async ({ flow, tenantDB, now }) => {
  const cfg = flow.trigger_config || {};
  const hours = Math.max(Number(cfg.hours_overdue) || 0, 0);
  const to = now.clone().subtract(hours, "hours").format("YYYY-MM-DD HH:mm:ss");
  const from = now.clone().subtract(hours + lookback(cfg) * 24, "hours").format("YYYY-MM-DD HH:mm:ss");
  const kind = cfg.task_kind === "ticket" ? "AND `is_support_ticket` = 1" : cfg.task_kind === "task" ? "AND `is_support_ticket` = 0" : "";
  const rows = await q(
    tenantDB,
    "SELECT * FROM `task_managements` WHERE `isDelete` = 0 AND `is_archive` = 0 AND `company_masters_id` = :company " +
      `AND \`completed_date\` IS NULL AND \`task_enddate\` BETWEEN :from AND :to ${kind} LIMIT ${MAX_ROWS}`,
    { company: flow.company_masters_id, from, to }
  );
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: "task", id: r.id, period_key: `od${hours}`, record: r }));
};

// T11.1 (no config needed): reminders whose time has come and are still pending.
const reminder_due = async ({ flow, tenantDB, now, cfg = flow.trigger_config || {} }) => {
  const to = now.format("YYYY-MM-DD HH:mm:ss");
  const from = now.clone().subtract(lookback(cfg), "days").format("YYYY-MM-DD HH:mm:ss");
  const rows = await q(
    tenantDB,
    "SELECT * FROM `reminder_messages` WHERE `isDelete` = 0 AND `status` = 0 AND `company_masters_id` = :company " +
      `AND \`reminder_data_time\` BETWEEN :from AND :to LIMIT ${MAX_ROWS}`,
    { company: flow.company_masters_id, from, to }
  );
  return rows
    .filter((r) => evaluateRules(cfg.rules, cfg.match, { record: r }))
    .map((r) => ({ record_type: "reminder", id: r.id, period_key: "", record: r }));
};

export const CRON_FINDERS = {
  schedule,
  date_field,
  "contact.special_date": contact_special_date,
  "contact.inactive": contact_inactive,
  "cart.not_converted": cart_not_converted,
  "cart.due": cart_due,
  "payment.overdue": payment_overdue,
  "task.overdue": task_overdue,
  "reminder.due": reminder_due,
};

export const findDueItems = async (flow, tenantDB, settings) => {
  const finder = CRON_FINDERS[flow.trigger_type];
  if (!finder) return [];
  return finder({ flow, tenantDB, now: nowIn(settings) });
};

export const maxPerDay = (flow) => Math.min(Math.max(Number(flow.trigger_config?.max_per_day) || 200, 1), 2000);

