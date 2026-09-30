import crypto from "crypto";
import { automationModels } from "../../models/automation/automationModels.js";
import { insertThirdPartyLog } from "../activities/thirdPartyLogService.js";
import { baseURL } from "../../utils/appConstants.js";
import { evaluateRules } from "./conditions.js";
import { THIRD_PARTY_LOG_INTEGRATION } from "./constants.js";
import { redact } from "./context.js";
import { startRun } from "./engine.js";
import { parseFlow } from "./flowStore.js";
import { tenantDBForCompany, logError } from "./runtime.js";

// Incoming webhook (T16.1): POST|GET /api/automation/hook/:companyId/:token
// Public (no login). Security: unguessable token in the URL; optional
// secret header or HMAC signature; per-webhook rate limit. Every call is
// logged to third_party_logs (integration = 'AUTOMATION', INBOUND).

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;
const SYNC_WAIT_MS = 8000;
const hits = new Map();

export const newToken = () => crypto.randomBytes(24).toString("hex");
export const newSecret = () => crypto.randomBytes(16).toString("hex");

export const webhookUrl = (companyId, token) => `${baseURL}/api/automation/hook/${companyId}/${token}`;

const notFound = { status: 404, body: { ok: false, message: "Not found" } };

const rateLimited = (id) => {
  const now = Date.now();
  const list = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return true;
  list.push(now);
  hits.set(id, list);
  if (hits.size > 5000) hits.clear();
  return false;
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const authorized = (hook, req) => {
  if (hook.auth_type === "secret") return safeEqual(req.headers["x-automation-secret"], hook.secret);
  if (hook.auth_type === "hmac") {
    const expected = crypto.createHmac("sha256", hook.secret || "").update(req.rawBody || Buffer.from("")).digest("hex");
    return safeEqual(String(req.headers["x-signature"] || "").replace(/^sha256=/, ""), expected);
  }
  return true; // token-only
};

const pickHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(headers || {}).filter(([k]) => ["content-type", "user-agent", "x-forwarded-for", "x-request-id", "x-event", "x-event-type"].includes(k.toLowerCase()))
  );

export const handleIncomingWebhook = async (req) => {
  const companyId = Number(req.params.companyId);
  const token = String(req.params.token || "");
  if (!companyId || token.length < 20) return notFound;

  const tenant = await tenantDBForCompany(companyId);
  if (!tenant) return notFound;
  const { tenantDB } = tenant;
  const { Webhook, Flow } = automationModels(tenantDB);

  let hook;
  try {
    hook = await Webhook.findOne({ where: { token, company_masters_id: companyId, isDelete: 0 }, raw: true });
  } catch {
    return notFound;
  }
  if (!hook || !hook.is_active) return notFound;
  if (rateLimited(hook.id)) return { status: 429, body: { ok: false, message: "Too many requests" } };

  const started = Date.now();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const payload = { query: req.query || {}, body, headers: pickHeaders(req.headers) };
  const log = (status, http, extra = {}) =>
    insertThirdPartyLog(tenantDB, {
      integration: THIRD_PARTY_LOG_INTEGRATION,
      direction: "INBOUND",
      module_name: `webhook #${hook.flow_id}`,
      url: `/automation/hook/${companyId}/…${token.slice(-6)}`,
      method: req.method,
      status_code: http,
      status,
      response_time: Date.now() - started,
      request_payload: redact(payload),
      company_masters_id: companyId,
      ...extra,
    });

  if (!authorized(hook, req)) {
    log("FAILED", 401, { error_message: "Bad secret / signature" });
    return { status: 401, body: { ok: false, message: "Unauthorized" } };
  }

  await Webhook.update({ last_called_at: new Date() }, { where: { id: hook.id } });

  // "Listen for sample": store the call, do not run the flow.
  if (hook.listen_until && new Date(hook.listen_until) > new Date()) {
    await Webhook.update({ sample_payload: JSON.stringify(payload), listen_until: null }, { where: { id: hook.id } });
    log("SUCCESS", 200, { response_payload: { listening: true } });
    return { status: 200, body: { ok: true, sample_saved: true } };
  }

  const flow = parseFlow(await Flow.findOne({ where: { id: hook.flow_id, isDelete: 0 }, raw: true }));
  if (!flow || !flow.is_active || flow.is_paused || flow.trigger_type !== "webhook.received") {
    log("FAILED", 200, { error_message: "Automation is not active" });
    return { status: 200, body: { ok: false, message: "Automation is not active" } };
  }

  const triggerCtx = {
    trigger: { type: "webhook.received", at: new Date().toISOString() },
    record_type: null,
    record_id: null,
    record: null,
    data: body,
    query: payload.query,
    headers: payload.headers,
    ip: req.ip,
  };
  if (!evaluateRules(flow.trigger_config?.rules, flow.trigger_config?.match, triggerCtx)) {
    log("SUCCESS", 200, { response_payload: { skipped: "filters did not match" } });
    return { status: 200, body: { ok: true, skipped: true } };
  }

  const running = startRun({ tenantDB, flow, company_masters_id: companyId, triggerCtx, origin: "webhook" }).catch((e) => {
    logError("webhook run", e);
    return { status: "failed", reason: e?.message };
  });
  const result = await Promise.race([running, new Promise((r) => setTimeout(() => r(null), SYNC_WAIT_MS))]);

  if (!result) {
    log("SUCCESS", 202, { response_payload: { accepted: true } });
    return { status: 202, body: { ok: true, accepted: true } };
  }
  if (result.response) {
    log(result.status === "failed" ? "FAILED" : "SUCCESS", result.response.status, { response_payload: result.response.body });
    return { status: result.response.status, body: result.response.body };
  }
  const ok = result.status !== "failed" && result.status !== "skipped";
  log(ok ? "SUCCESS" : "FAILED", 200, { response_payload: { execution_id: result.execution_id, status: result.status }, error_message: ok ? null : result.reason });
  return { status: 200, body: { ok, execution_id: result.execution_id || null, status: result.status, ...(ok ? {} : { message: result.reason }) } };
};
