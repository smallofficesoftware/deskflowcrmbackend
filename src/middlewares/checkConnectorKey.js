import { requestContext } from "../config/context.js";
import { marketplaceAddonConnectorKeysModel } from "../models/marketplace/marketplaceAddonConnectorKeysModel.js";
import { resError } from "../utils/sharedFunctions.js";

// Generic connector-key auth, shared by every connector-based marketplace addon
// (first user: Tally) - mirrors requireAddon.js's genericity. Runs AFTER
// tenantMiddleware (needs req.tenantDB already resolved) and does NOT run
// authenticateToken at all - the connector has no user login, it authenticates
// with its own per-company key instead. tenantMiddleware resolves the tenant
// from `companyCode` in the request body with no JWT (the same tokenless-
// webhook path Miracle's webhook already uses), so the connector only ever
// needs to send companyCode + x-connector-key, not a user session.
export const checkConnectorKey = (addonCode) => async (req, res, next) => {
  try {
    const connectorKey = req.headers?.["x-connector-key"];
    if (!req.tenantDB || !connectorKey) {
      return res.status(200).send(
        resError({ code: 403, ack_msg: "Connector key required", developer_msg: "Missing tenant context or x-connector-key header" })
      );
    }

    const company_masters_id = requestContext.getStore()?.companyId;
    const model = marketplaceAddonConnectorKeysModel(req.tenantDB);
    const keyRow = await model.findOne({
      where: { company_masters_id, addon_code: addonCode, connector_key: connectorKey, isActive: 1, isDelete: 0, revoked_date_time: null },
    });

    if (!keyRow) {
      return res.status(200).send(
        resError({ code: 403, ack_msg: "Invalid or revoked connector key", developer_msg: `No active key for addon '${addonCode}'` })
      );
    }

    await keyRow.update({ last_used_at: new Date() });
    req.connectorKeyRow = keyRow;
    next();
  } catch (error) {
    return res.status(200).send(resError({ developer_msg: `checkConnectorKey('${addonCode}') failed: ${error}` }));
  }
};
