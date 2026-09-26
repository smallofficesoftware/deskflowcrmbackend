import moment from "moment";
import { insertThirdPartyLog } from "../../activities/thirdPartyLogService.js";
import { THIRD_PARTY_LOG_INTEGRATION } from "../constants.js";
import { getPath, resolveDeep, resolveTemplate } from "../context.js";
import { emitAutomationEvent } from "../emit.js";
import { fetchRowById, fetchUser, firstUserId } from "../records.js";
import { makeReq } from "../runtime.js";

// Shared helpers for node handlers.

/** Resolve node parameters against the context. */
export const resolved = (params, ctx) => resolveDeep(params || {}, ctx);

/** The automation marker passed with every write, for chaining (13.7). */
export const automationMarker = (run) => ({
  origin: "automation",
  chain_depth: run.chain_depth,
  execution_id: run.execution_id,
  flow_ids: run.source_flow_ids,
});

/** Request-like object for calling existing services unchanged. */
export const reqFor = (run, body = {}, loginId) =>
  makeReq({
    tenantDB: run.tenantDB,
    company_masters_id: run.company_masters_id,
    a_application_login_id: loginId || run.run_as_user_id,
    body,
    automation: automationMarker(run),
  });

/** Emit from a node's own direct write so other flows can chain on it. */
export const emitFromNode = (run, eventType, payload) => {
  if (run.is_test) return;
  emitAutomationEvent(
    {
      tenantDB: run.tenantDB,
      company_masters_id: run.company_masters_id,
      a_application_login_id: run.run_as_user_id,
      automation: automationMarker(run),
    },
    eventType,
    payload
  );
};

/** Which user a step acts as: "run_as" | "assigned_user" | a user id. */
export const actingUserId = (who, ctx, run) => {
  if (who === "assigned_user") return ctx.assigned_user?.id || run.run_as_user_id;
  if (who && who !== "run_as" && Number(who)) return Number(who);
  return run.run_as_user_id;
};

/** Target record id: explicit param, else the trigger record when types match. */
export const targetId = (explicit, ctx, recordType) => {
  const id = Number(explicit);
  if (id) return id;
  if (ctx.record_type === recordType && ctx.record_id) return ctx.record_id;
  if (recordType === "contact" && ctx.contact?.id) return ctx.contact.id;
  return null;
};

export const requireId = (id, what) => {
  if (!id) throw new Error(`No ${what} to work on - pick one or use a ${what} trigger`);
  return id;
};

/** Recipient resolution for messages. */
export const resolveRecipient = async (to, custom, ctx, channel) => {
  const field = channel === "email" ? "email" : "mobile";
  if (to === "contact") return channel === "email" ? ctx.contact?.email_id : ctx.contact?.mobile_number;
  if (to === "assigned_user") return ctx.assigned_user?.[field];
  if (to === "run_as") return ctx.run_as?.[field];
  if (to === "manager") {
    const managerId = firstUserId(ctx.assigned_user?.reporting_member);
    const m = managerId ? await fetchUser(managerId) : null;
    return channel === "email" ? m?.recovery_email : m?.recovery_mobile;
  }
  return resolveTemplate(custom, ctx);
};

export const normalizeMobile = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
};

/** Log a send / webhook call to the existing third_party_logs (13.12). */
export const logThirdParty = (run, entry) =>
  insertThirdPartyLog(run.tenantDB, {
    integration: THIRD_PARTY_LOG_INTEGRATION,
    company_masters_id: run.company_masters_id,
    a_application_login_id: run.run_as_user_id,
    module_name: `${run.flow.name}`.slice(0, 60) + (entry.step ? ` / ${entry.step}`.slice(0, 38) : ""),
    ...entry,
  });

/** Build { column: value } from a [{ field, value }] list. */
export const fieldMap = (list) =>
  Object.fromEntries(
    (Array.isArray(list) ? list : [])
      .filter((f) => f && f.field)
      .map((f) => [f.field, f.value === "" ? null : f.value])
  );

/** Only allow plain column names in user-built field maps. */
export const safeColumns = (obj, blocked = []) => {
  const block = new Set(["id", "company_masters_id", "isDelete", ...blocked]);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => /^[a-z_][a-z0-9_]*$/i.test(k) && !block.has(k)));
};

export const nowSql = () => moment().format("YYYY-MM-DD HH:mm:ss");

export const readRecord = (run, table, id) => fetchRowById(run.tenantDB, table, id);

export { getPath };
