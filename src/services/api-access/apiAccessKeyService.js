import crypto from "crypto";
import companyModel from "../../models/company_setup/companyModel.js";
import { marketplaceAddonConnectorKeysModel } from "../../models/marketplace/marketplaceAddonConnectorKeysModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

export const API_ADDON_CODE = "api";
const KEY_PREFIX = "dfk_";

// Customer-facing API keys for the "API" marketplace addon. Stored in the generic
// marketplace_addon_connector_keys table (addon_code = 'api') but, unlike the Tally connector key, only a
// SHA-256 hash is kept - the readable key is returned once, at creation, and can never be shown again.
// The settings screen therefore only shows "a key exists" plus its issued / last-used dates.

export const hashApiKey = (apiKey) => crypto.createHash("sha256").update(String(apiKey)).digest("hex");

const companyOf = (req) => req.user?.companyId;

/** Settings screen: is there an active key, when was it issued / last used. Never returns the key itself. */
export const getApiAccessStatus = async (req) => {
  try {
    const company_masters_id = companyOf(req);
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const row = await marketplaceAddonConnectorKeysModel(req.tenantDB).findOne({
      where: { company_masters_id, addon_code: API_ADDON_CODE, isActive: 1, isDelete: 0, revoked_date_time: null },
      order: [["id", "DESC"]],
      raw: true,
    });
    // The company code goes in the body of the token request (it is the company's public qr_code).
    const company = await companyModel.findOne({ where: { id: company_masters_id, isDelete: "0" }, attributes: ["qr_code"], raw: true });
    return resSuccess({
      data: {
        item: {
          has_key: Boolean(row),
          issued_date_time: row?.issued_date_time ?? null,
          last_used_at: row?.last_used_at ?? null,
          company_code: company?.qr_code ?? null,
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `getApiAccessStatus failed: ${error}` });
  }
};

/** Issues a fresh key (revoking any earlier active one - one active key per company) and returns it ONCE. */
export const issueApiKey = async (req) => {
  try {
    const company_masters_id = companyOf(req);
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const model = marketplaceAddonConnectorKeysModel(req.tenantDB);
    await model.update(
      { isActive: 0, revoked_date_time: new Date() },
      { where: { company_masters_id, addon_code: API_ADDON_CODE, isActive: 1 } }
    );

    const api_key = KEY_PREFIX + crypto.randomBytes(24).toString("hex");
    const row = await model.create({ company_masters_id, addon_code: API_ADDON_CODE, connector_key: hashApiKey(api_key) });

    return resSuccess({ data: { item: { api_key, issued_date_time: row.issued_date_time } } });
  } catch (error) {
    return resError({ developer_msg: `issueApiKey failed: ${error}` });
  }
};

/** Revokes the active key. Tokens already issued from it stop working on their next request (apiScopeGate). */
export const revokeApiKey = async (req) => {
  try {
    const company_masters_id = companyOf(req);
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const [count] = await marketplaceAddonConnectorKeysModel(req.tenantDB).update(
      { isActive: 0, revoked_date_time: new Date() },
      { where: { company_masters_id, addon_code: API_ADDON_CODE, isActive: 1 } }
    );
    return resSuccess({ data: { revoked: count } });
  } catch (error) {
    return resError({ developer_msg: `revokeApiKey failed: ${error}` });
  }
};
