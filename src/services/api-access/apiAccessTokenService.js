import jwt from "jsonwebtoken";
import { requestContext } from "../../config/context.js";
import { marketplaceAddonConnectorKeysModel } from "../../models/marketplace/marketplaceAddonConnectorKeysModel.js";
import { JWT_TOKEN_SIGNATURE } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { API_ADDON_CODE, hashApiKey } from "./apiAccessKeyService.js";

export const API_TOKEN_SCOPE = "api";
export const API_TOKEN_EXPIRES_IN = "1h";

/**
 * PUBLIC (no user session): exchanges a company's API key for a short-lived JWT.
 * Body: { companyCode, api_key }. tenantMiddleware has already resolved the tenant from companyCode (the same
 * tokenless path the Tally connector uses). The JWT is signed like a normal login token so every existing
 * authenticateToken route accepts it, but it carries scope "api" + key_id, which apiScopeGate uses to keep it
 * on the allow-listed product routes and to cut it off the moment the key is revoked.
 */
export const createApiToken = async (req) => {
  try {
    const api_key = String(req.body?.api_key || "").trim();
    const store = requestContext.getStore();
    const company_masters_id = store?.companyId;
    const ownerLoginId = store?.tenantId;
    if (!req.tenantDB || !company_masters_id || !ownerLoginId) {
      return resBadRequest({ ack_msg: "Invalid companyCode", developer_msg: "Tenant context missing" });
    }
    if (!api_key) return resBadRequest({ ack_msg: "api_key is required", developer_msg: "api_key missing" });

    const keyRow = await marketplaceAddonConnectorKeysModel(req.tenantDB).findOne({
      where: { company_masters_id, addon_code: API_ADDON_CODE, connector_key: hashApiKey(api_key), isActive: 1, isDelete: 0, revoked_date_time: null },
    });
    if (!keyRow) return resError({ code: 403, ack_msg: "Invalid or revoked API key", developer_msg: "No active api key matches" });

    const { enabled } = await isAppEnabledForCompany(req.tenantDB, company_masters_id, API_ADDON_CODE);
    if (!enabled) return resError({ code: 403, ack_msg: "The API addon is not enabled for this company", developer_msg: "addon 'api' disabled" });

    await keyRow.update({ last_used_at: new Date() });

    const token = jwt.sign(
      { id: ownerLoginId, companyId: company_masters_id, scope: API_TOKEN_SCOPE, key_id: keyRow.id },
      JWT_TOKEN_SIGNATURE,
      { expiresIn: API_TOKEN_EXPIRES_IN }
    );
    return resSuccess({ data: { item: { token, token_type: "jwt", expires_in: API_TOKEN_EXPIRES_IN } } });
  } catch (error) {
    return resError({ developer_msg: `createApiToken failed: ${error}` });
  }
};
