import moment from "moment";
import { evaluateRule, evaluateRules } from "../conditions.js";
import { resolveTemplate } from "../context.js";
import { addDuration, nextBusinessMoment } from "../time.js";

// A7 logic steps + the trigger step + A8.1 set variable.

// Trigger step: the context is already built by the engine; pass through.
export const trigger = async ({ ctx }) => ({
  output: { type: ctx.trigger?.type, record_type: ctx.record_type, record_id: ctx.record_id },
});

// A7.1 Condition (multi-branch): params.conditions = [{ id, field, operator, value, sourceHandle }]
// First matching condition's handle wins; otherwise "no_match".
export const condition = async ({ ctx, params }) => {
  for (const c of params.conditions || []) {
    const rules = Array.isArray(c.rules) ? c.rules : [c];
    if (evaluateRules(rules, c.match, ctx)) {
      return { output: { matched: c.id || c.sourceHandle }, handle: c.sourceHandle || c.id };
    }
  }
  return { output: { matched: null }, handle: params.no_match_handle || "no_match" };
};

// A7.2 If / Else: params.rules + params.match -> "if-true" | "if-false"
export const if_else = async ({ ctx, params }) => {
  const ok = evaluateRules(params.rules, params.match, ctx);
  return { output: { result: ok }, handle: ok ? "if-true" : "if-false" };
};

// A7.4 Wait X time: params.amount + params.unit (minutes | hours | days | weeks)
export const wait = async ({ ctx, params, run }) => {
  const amount = Number(resolveTemplate(params.amount, ctx)) || 0;
  if (amount <= 0) return { output: { waited: false } };
  const resume_at = addDuration(amount, params.unit);
  if (run.is_test) return { output: { would_wait_until: resume_at, dry_run: true } };
  return { output: { resume_at }, wait: { resume_at, wait_type: "time" } };
};

// A7.5 Wait until: params.mode = "datetime" (params.at, {{ }} ok) | "business_hours"
//   | "date_field" (params.field = context path to a date, params.offset_days)
export const wait_until = async ({ ctx, params, run }) => {
  let at = null;
  if (params.mode === "business_hours") {
    at = nextBusinessMoment(run.settings);
    if (!at) return { output: { waited: false, reason: "Already in business hours" } };
  } else {
    const raw = params.mode === "date_field" ? resolveTemplate(`{{${params.field}}}`, ctx) : resolveTemplate(params.at, ctx);
    const m = moment(raw);
    if (!raw || !m.isValid()) throw new Error(`Wait until: "${raw}" is not a valid date`);
    at = m.add(Number(params.offset_days) || 0, "days");
    if (params.time) {
      const [h, mi] = String(params.time).split(":").map(Number);
      at.hours(h || 0).minutes(mi || 0).seconds(0);
    }
  }
  if (!at.isAfter(moment())) return { output: { waited: false, reason: "Date already passed" } };
  const resume_at = at.toDate();
  if (run.is_test) return { output: { would_wait_until: resume_at, dry_run: true } };
  return { output: { resume_at }, wait: { resume_at, wait_type: params.mode || "datetime" } };
};

// A7.9 Stop
export const stop = async ({ params }) => ({ output: { stopped: true, reason: params.reason || null }, stop: true });

// A8.1 Set variable: params.variables = [{ name, value }]  -> ctx.vars.<name>
export const set_variable = async ({ ctx, params }) => {
  const set = {};
  for (const v of params.variables || []) {
    if (!v?.name) continue;
    set[v.name] = resolveTemplate(v.value, ctx);
    ctx.vars[v.name] = set[v.name];
  }
  return { output: set };
};

export { evaluateRule };
