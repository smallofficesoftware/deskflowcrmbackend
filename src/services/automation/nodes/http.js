import axios from "axios";
import crypto from "crypto";
import { getPath, resolveDeep, resolveTemplate } from "../context.js";
import { logThirdParty } from "./helpers.js";

// A8.3 Webhook call / HTTP request (outgoing) and A8.4 Webhook response.
//
// params:
//   method GET|POST|PUT|PATCH|DELETE, url, headers [{ key, value }],
//   query [{ key, value }], body_type json|form|raw, body (object or string),
//   auth none|bearer|basic|api_key|hmac,
//   auth_token / auth_user / auth_password / api_key_name / api_key_value / hmac_secret / hmac_header,
//   timeout_seconds (default 15, max 60), retries (default 0, max 3),
//   response_mapping [{ path, variable }]
// Wires: "src" on 2xx, "failed" on non-2xx / timeout (falls back to on_error).

const pairs = (list) =>
  Object.fromEntries((Array.isArray(list) ? list : []).filter((x) => x?.key).map((x) => [x.key, x.value]));

const isPrivateHost = (host) =>
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|\[::1\])/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);

const assertUrl = (raw) => {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not a valid URL`);
  }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http and https URLs are allowed");
  if (isPrivateHost(u.hostname) && process.env.AUTOMATION_ALLOW_PRIVATE_URLS !== "1") {
    throw new Error("Calls to private / local addresses are blocked");
  }
  return u;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const http_request = async ({ ctx, params, run }) => {
  const p = resolveDeep(params, ctx);
  const method = String(p.method || "POST").toUpperCase();
  const url = assertUrl(p.url);
  const headers = { ...pairs(p.headers) };
  const query = pairs(p.query);

  let data;
  const bodyType = p.body_type || "json";
  if (!["GET", "DELETE"].includes(method) && p.body != null && p.body !== "") {
    if (bodyType === "form") {
      data = new URLSearchParams(typeof p.body === "object" ? p.body : pairs(p.body)).toString();
      headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded";
    } else if (bodyType === "raw") {
      data = typeof p.body === "string" ? p.body : JSON.stringify(p.body);
    } else {
      data = typeof p.body === "string" ? p.body : JSON.stringify(p.body);
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
  }

  const auth = p.auth || "none";
  if (auth === "bearer") headers.Authorization = `Bearer ${p.auth_token}`;
  else if (auth === "basic") headers.Authorization = `Basic ${Buffer.from(`${p.auth_user}:${p.auth_password}`).toString("base64")}`;
  else if (auth === "api_key" && p.api_key_name) headers[p.api_key_name] = p.api_key_value;
  else if (auth === "hmac" && p.hmac_secret) {
    headers[p.hmac_header || "X-Signature"] = crypto.createHmac("sha256", p.hmac_secret).update(data || "").digest("hex");
  }

  const input = { method, url: url.toString(), query, body_type: bodyType };
  if (run.is_test && p.dry_run !== false && method !== "GET") {
    return { input, output: { dry_run: true, would_call: `${method} ${url}` } };
  }

  const timeout = Math.min(Math.max(Number(p.timeout_seconds) || 15, 1), 60) * 1000;
  const retries = Math.min(Math.max(Number(p.retries) || 0, 0), 3);
  const started = Date.now();
  let res = null;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      res = await axios({ method, url: url.toString(), params: query, headers, data, timeout, validateStatus: () => true, maxContentLength: 5 * 1024 * 1024 });
      if (res.status < 500) break; // retry only on network errors / 5xx
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries) await sleep(1000 * 2 ** attempt);
  }

  const ok = !!res && res.status >= 200 && res.status < 300;
  logThirdParty(run, {
    step: "http",
    direction: "OUTBOUND",
    method,
    url: url.toString().slice(0, 500),
    status_code: res?.status || null,
    status: ok ? "SUCCESS" : "FAILED",
    response_time: Date.now() - started,
    request_payload: { query, body: data },
    response_payload: res?.data,
    error_message: ok ? null : lastError?.message || `HTTP ${res?.status}`,
  });

  const output = { status: res?.status || 0, ok, response: res?.data ?? null, error: ok ? null : lastError?.message || `HTTP ${res?.status}` };
  for (const m of p.response_mapping || []) {
    if (m?.variable && m?.path) ctx.vars[m.variable] = output[m.variable] = getPath({ response: res?.data }, m.path.startsWith("response") ? m.path : `response.${m.path}`);
  }
  return { input, output, handle: ok ? "src" : "failed" };
};

// A8.4 Webhook response - sets what the caller of an incoming webhook gets back.
// params: status_code (default 200), body (object / string with {{ }})
export const webhook_response = async ({ ctx, params, run }) => {
  const status = Number(params.status_code) || 200;
  const body = resolveDeep(params.body ?? { ok: true }, ctx);
  run.response = { status, body };
  ctx.__response = run.response;
  return { output: { status, body } };
};

export { resolveTemplate };
