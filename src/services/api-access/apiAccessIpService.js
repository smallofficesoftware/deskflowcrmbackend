import net from "net";
import { getTenantDB } from "../../config/dbManager.js";
import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// IP allow-list for the "API" marketplace addon. One list per company (marketplace_addon_settings.config_json
// .allowed_ips, addon_code 'api') that applies to every API key of that company.
//
// An EMPTY list blocks everything: an API key is unusable until at least one address is listed. Entries are a
// single IPv4 / IPv6 address or an IPv4 / IPv6 CIDR range (e.g. 203.0.113.0/24).
//
// Enforced twice: when a key is exchanged for a token (apiAccessTokenService.js) and on every call made with that
// token (middlewares/apiScopeGate.js) - the same two places that check the key itself.

export const API_ADDON_CODE = "api";
const MAX_ENTRIES = 50;
const CACHE_MS = 30 * 1000;
const listCache = new Map();

/** "::ffff:1.2.3.4" (IPv4 seen through a dual-stack socket) -> "1.2.3.4". */
const stripV4Mapped = (ip) => String(ip || "").trim().replace(/^::ffff:/i, "");

/**
 * The caller's address. A client can send its own X-Forwarded-For and the proxy APPENDS to it, so the left-most
 * entry (what req.ip gives with "trust proxy") is spoofable - exactly wrong for an allow-list. Count in from the
 * right instead: API_ACCESS_TRUSTED_PROXY_HOPS proxies (default 1, i.e. one nginx) sit in front of this app, and
 * the address the nearest one saw is the one that many entries from the end.
 */
export const getClientIp = (req) => {
  const hops = Math.max(0, Number(process.env.API_ACCESS_TRUSTED_PROXY_HOPS ?? 1) || 0);
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const picked = hops > 0 && forwarded.length > 0 ? forwarded[Math.max(0, forwarded.length - hops)] : req.socket?.remoteAddress || req.ip;
  return stripV4Mapped(picked);
};

/** Validates one list entry; returns the normalised string or null. */
export const normalizeEntry = (raw) => {
  const value = stripV4Mapped(raw);
  if (!value) return null;
  const [addr, prefix, ...rest] = value.split("/");
  if (rest.length) return null;
  const family = net.isIP(addr);
  if (!family) return null;
  if (prefix === undefined) return addr.toLowerCase();
  if (!/^\d{1,3}$/.test(prefix)) return null;
  const bits = Number(prefix);
  if (bits < 0 || bits > (family === 4 ? 32 : 128)) return null;
  return `${addr.toLowerCase()}/${bits}`;
};

/** True when `ip` equals a listed address or falls inside a listed range. */
export const isIpInList = (list, ip) => {
  const client = stripV4Mapped(ip);
  const clientFamily = net.isIP(client);
  if (!clientFamily) return false;
  const block = new net.BlockList();
  for (const entry of list || []) {
    const [addr, prefix] = String(entry).split("/");
    const family = net.isIP(addr);
    if (!family) continue;
    const type = family === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) block.addAddress(addr, type);
    else block.addSubnet(addr, Number(prefix), type);
  }
  return block.check(client, clientFamily === 4 ? "ipv4" : "ipv6");
};

const readList = async (tenantDB, company_masters_id) => {
  const row = await marketplaceAddonSettingsModel(tenantDB).findOne({
    where: { company_masters_id, addon_code: API_ADDON_CODE, isDelete: 0 },
    attributes: ["config_json"],
    raw: true,
  });
  let config = row?.config_json;
  if (typeof config === "string") {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }
  return Array.isArray(config?.allowed_ips) ? config.allowed_ips.map(String) : [];
};

/** Used by the token exchange (tenant DB already open) - uncached, so a change applies at once. */
export const isClientIpAllowed = async (tenantDB, company_masters_id, ip) => isIpInList(await readList(tenantDB, company_masters_id), ip);

/** Used on every API call (apiScopeGate): cached for a few seconds like the key check, so a busy client costs no DB read per request. */
export const isClientIpAllowedCached = async (decoded, ip) => {
  const cacheKey = String(decoded.companyId);
  let hit = listCache.get(cacheKey);
  if (!hit || Date.now() - hit.at >= CACHE_MS) {
    const tenant = await getTenantDB(decoded.id, decoded.companyId);
    const list = tenant?.sequelize ? await readList(tenant.sequelize, decoded.companyId) : [];
    if (listCache.size > 2000) listCache.clear();
    hit = { list, at: Date.now() };
    listCache.set(cacheKey, hit);
  }
  return isIpInList(hit.list, ip);
};

// ---------------------------------------------------------------- settings screen (CRM staff)

/** POST /api-access/ips/get -> { allowed_ips, your_ip } (your_ip lets the screen offer "add my current IP"). */
export const getApiAccessIps = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    return resSuccess({ data: { item: { allowed_ips: await readList(req.tenantDB, company_masters_id), your_ip: getClientIp(req) } } });
  } catch (error) {
    return resError({ developer_msg: `getApiAccessIps failed: ${error}` });
  }
};

/** POST /api-access/ips/save { allowed_ips: string[] } - replaces the whole list. */
export const saveApiAccessIps = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const input = req.body?.allowed_ips;
    if (!Array.isArray(input)) return resBadRequest({ ack_msg: "allowed_ips must be a list", developer_msg: "allowed_ips is not an array" });
    if (input.length > MAX_ENTRIES) return resBadRequest({ ack_msg: `At most ${MAX_ENTRIES} entries are allowed.` });

    const cleaned = [];
    for (const raw of input) {
      if (!String(raw ?? "").trim()) continue; // blank lines from the textarea
      const entry = normalizeEntry(raw);
      if (!entry) return resBadRequest({ ack_msg: `"${String(raw).trim().slice(0, 60)}" is not a valid IP address or range.` });
      if (!cleaned.includes(entry)) cleaned.push(entry);
    }

    const model = marketplaceAddonSettingsModel(req.tenantDB);
    const existing = await model.findOne({ where: { company_masters_id, addon_code: API_ADDON_CODE, isDelete: 0 } });
    let config = existing?.config_json;
    if (typeof config === "string") {
      try {
        config = JSON.parse(config);
      } catch {
        config = {};
      }
    }
    const nextConfig = { ...(config || {}), allowed_ips: cleaned };
    if (existing) await existing.update({ config_json: nextConfig, modified_date: new Date() });
    else await model.create({ company_masters_id, addon_code: API_ADDON_CODE, config_json: nextConfig });

    listCache.delete(String(company_masters_id)); // this process applies the change at once
    return resSuccess({ ack_msg: "Allowed IPs saved", data: { item: { allowed_ips: cleaned } } });
  } catch (error) {
    return resError({ developer_msg: `saveApiAccessIps failed: ${error}` });
  }
};
