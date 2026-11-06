import jwt from "jsonwebtoken";
import { getTenantDB } from "../config/dbManager.js";
import { marketplaceAddonConnectorKeysModel } from "../models/marketplace/marketplaceAddonConnectorKeysModel.js";
import { JWT_TOKEN_SIGNATURE } from "../utils/appConstants.js";
import { resError } from "../utils/sharedFunctions.js";
import { getClientIp, isClientIpAllowedCached } from "../services/api-access/apiAccessIpService.js";

// Keeps an "API addon" token (JWT with scope "api", see services/api-access/apiAccessTokenService.js) on the
// product routes it is meant for. authenticateToken only checks the JWT signature, so without this gate an API
// token would be accepted on EVERY CRM route. Mounted once, before the routers, in indexRouter.js.
//
// Normal login tokens (no scope) pass straight through untouched - the only cost for them is one jwt.decode.

// Existing read-only product routes an API token may call, plus the combined listing added by this addon.
// Add a path here to open another existing route to API tokens.
export const API_TOKEN_ALLOWED_PATHS = new Set([
  "/api-access/products",
  "/api-access/categories",
  "/api-access/product-groups",
  "/product",
  "/get-product-images",
  "/get-variants",
  "/get-variant-attributes",
  "/get-attribute-masters",
  "/priceListMaster",
  "/priceListItem",
  "/product-unit-get",
]);

// A key's active/revoked state is cached briefly so a busy client does not cost a DB read per request.
const KEY_CACHE_MS = 30 * 1000;
const keyCache = new Map();

const isKeyActive = async (decoded) => {
  const cacheKey = `${decoded.companyId}:${decoded.key_id}`;
  const hit = keyCache.get(cacheKey);
  if (hit && Date.now() - hit.at < KEY_CACHE_MS) return hit.active;

  const tenant = await getTenantDB(decoded.id, decoded.companyId);
  const row = tenant?.sequelize
    ? await marketplaceAddonConnectorKeysModel(tenant.sequelize).findOne({
        where: { id: decoded.key_id, company_masters_id: decoded.companyId, addon_code: "api", isActive: 1, isDelete: 0, revoked_date_time: null },
        attributes: ["id"],
        raw: true,
      })
    : null;
  const active = Boolean(row);
  if (keyCache.size > 2000) keyCache.clear();
  keyCache.set(cacheKey, { active, at: Date.now() });
  return active;
};

const deny = (res, ack_msg, developer_msg) => res.status(200).send(resError({ code: 403, ack_msg, developer_msg }));

export const apiScopeGate = async (req, res, next) => {
  try {
    const token = req.headers?.authorization;
    if (!token) return next();

    const peek = jwt.decode(token);
    if (peek?.scope !== "api") return next();

    // Claims say "API token": now verify the signature properly before trusting any of it.
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_TOKEN_SIGNATURE);
    } catch {
      return next(); // authenticateToken will answer "Please login" for a bad token.
    }
    if (decoded.scope !== "api" || !decoded.key_id || !decoded.companyId || !decoded.id) {
      return deny(res, "Invalid API token", "API token is missing required claims");
    }

    // req.path is relative to where the router is mounted (app.use("/api", routers())), so "/api/product" -> "/product".
    const path = String(req.path || "").replace(/\/+$/, "") || "/";
    if (!API_TOKEN_ALLOWED_PATHS.has(path)) {
      return deny(res, "This API token cannot call this endpoint", `Path '${path}' is not available to API tokens`);
    }

    const clientIp = getClientIp(req);
    if (!(await isClientIpAllowedCached(decoded, clientIp))) {
      return deny(res, "Your IP address is not allowed to use this API", `IP ${clientIp} is not in the company's API allow-list`);
    }

    if (!(await isKeyActive(decoded))) {
      return deny(res, "API key has been revoked", "The key this token was issued from is no longer active");
    }

    // The existing product services resolve the company from a_application_login_id in the body; pin it to the
    // key owner so a client cannot point the call at another login/company.
    if (!req.body || typeof req.body !== "object") req.body = {};
    req.body.a_application_login_id = decoded.id;
    return next();
  } catch (error) {
    return res.status(200).send(resError({ developer_msg: `apiScopeGate failed: ${error}` }));
  }
};
