import { productModel } from "../../models/product_settings/productModel.js";
import { marketplaceAddonRecordMappingsModel } from "../../models/marketplace/marketplaceAddonRecordMappingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyId } from "./tallyAuthHelper.js";

const ADDON_CODE = "tally";
const ENTITY_PRODUCT = "product";

// Record-mapping CRUD for products (plans/2026-10-08-marketplace-tally-plan.txt
// Q6/4.1 + the 22-10-2026 product auto-match clarification). Reads/writes the
// GENERIC marketplace_addon_record_mappings table filtered by addon_code='tally'
// - this file does not own that table.
//
// Auto-match algorithm for products (exactly two cases, no 4-tier cascade):
//   1. ALREADY SYNCED - a mapping row already has external_id set - use it
//      directly, match_confidence='already_synced'.
//   2. NOT YET SYNCED - no mapping row (or one with no external_id yet) -
//      suggest by product_code; this service only SURFACES the CRM-side code
//      for that case, since actually resolving it against Tally's stock items
//      needs live Tally data (connector/Direct URL executor, P5b) this slice
//      does not have. match_confidence stays null until something sets it.

/** List every CRM product for this company with its current Tally mapping status, if any. */
export const listProductMappings = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const products = await productModel(req.tenantDB).findAll({
      where: { company_masters_id, isDelete: 0 },
      attributes: ["id", "product_name", "product_code"],
      raw: true,
    });

    const mappings = await marketplaceAddonRecordMappingsModel(req.tenantDB).findAll({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_PRODUCT, isDelete: 0 },
      raw: true,
    });
    const mappingByCrmId = new Map(mappings.map((m) => [m.crm_id, m]));

    const items = products.map((p) => {
      const mapping = mappingByCrmId.get(p.id);
      const alreadySynced = Boolean(mapping?.external_id);
      return {
        crm_id: p.id,
        product_name: p.product_name,
        product_code: p.product_code,
        mapping_status: alreadySynced ? "already_synced" : mapping ? "suggested" : "unmapped",
        external_id: mapping?.external_id || null,
        external_ref: mapping?.external_ref || null,
        match_confidence: alreadySynced ? "already_synced" : mapping?.match_confidence || null,
        is_confirmed: Boolean(mapping?.is_confirmed),
      };
    });

    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `listProductMappings failed: ${error}` });
  }
};

/** Create/update one product's mapping - user confirming or editing a suggestion. */
export const saveProductMapping = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { crm_id, external_id, external_ref, is_confirmed } = req.body || {};
    if (!crm_id) {
      return resBadRequest({ developer_msg: "crm_id is required" });
    }

    const model = marketplaceAddonRecordMappingsModel(req.tenantDB);
    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_PRODUCT, crm_id, isDelete: 0 },
    });

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      entity_type: ENTITY_PRODUCT,
      crm_id,
      external_id: external_id ?? existing?.external_id ?? null,
      external_ref: external_ref ?? existing?.external_ref ?? null,
      match_confidence: external_id ? "already_synced" : existing?.match_confidence || null,
      is_confirmed: is_confirmed ? 1 : existing?.is_confirmed || 0,
      direction: existing?.direction || "both",
      modified_date: new Date(),
    };

    const row = existing ? await existing.update(fields) : await model.create(fields);

    return resSuccess({ data: { item: row } });
  } catch (error) {
    return resError({ developer_msg: `saveProductMapping failed: ${error}` });
  }
};
