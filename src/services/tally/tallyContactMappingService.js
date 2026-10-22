import { contactModel } from "../../models/activities/contactModel.js";
import { marketplaceAddonRecordMappingsModel } from "../../models/marketplace/marketplaceAddonRecordMappingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "tally";
const ENTITY_CONTACT = "contact";

// Record-mapping CRUD for contacts<->ledgers (plans/2026-10-08-marketplace-
// tally-plan.txt Q6/4.1). Same shape as tallyMappingService.js (products) -
// reads/writes the GENERIC marketplace_addon_record_mappings table filtered
// by addon_code='tally', does not own that table.
//
// Already-synced-by-id fast path is universal (same as products). For the
// NOT-yet-synced suggestion, contacts use Q6's own priority - GSTIN first,
// then code, then name - unlike products (code only), since this plan's
// 22-10-2026 product clarification was product-specific. Actually resolving
// a suggestion against Tally's live ledgers needs the connector (P5b), not
// built yet - this slice only surfaces the CRM-side signal to suggest from.

/** List every CRM contact for this company with its current Tally mapping status, if any. */
export const listContactMappings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const contacts = await contactModel(req.tenantDB).findAll({
      where: { company_masters_id, isDelete: 0 },
      attributes: ["id", "person_name", "company_name", "client_code", "gst_number"],
      raw: true,
    });

    const mappings = await marketplaceAddonRecordMappingsModel(req.tenantDB).findAll({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_CONTACT, isDelete: 0 },
      raw: true,
    });
    const mappingByCrmId = new Map(mappings.map((m) => [m.crm_id, m]));

    const items = contacts.map((c) => {
      const mapping = mappingByCrmId.get(c.id);
      const alreadySynced = Boolean(mapping?.external_id);
      // Suggestion priority signal only (Q6: GSTIN > code > name) - the actual
      // match against Tally ledgers happens once live Tally data exists (P5b).
      const suggestSignal = c.gst_number ? "gstin" : c.client_code ? "code" : "name";
      return {
        crm_id: c.id,
        contact_name: c.company_name || c.person_name,
        client_code: c.client_code,
        gst_number: c.gst_number,
        mapping_status: alreadySynced ? "already_synced" : mapping ? "suggested" : "unmapped",
        external_id: mapping?.external_id || null,
        external_ref: mapping?.external_ref || null,
        match_confidence: alreadySynced ? "already_synced" : mapping?.match_confidence || null,
        suggest_signal: alreadySynced ? null : suggestSignal,
        is_confirmed: Boolean(mapping?.is_confirmed),
      };
    });

    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `listContactMappings failed: ${error}` });
  }
};

/** Create/update one contact's mapping - user confirming or editing a suggestion. */
export const saveContactMapping = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { crm_id, external_id, external_ref, is_confirmed } = req.body || {};
    if (!crm_id) {
      return resBadRequest({ developer_msg: "crm_id is required" });
    }

    const model = marketplaceAddonRecordMappingsModel(req.tenantDB);
    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_CONTACT, crm_id, isDelete: 0 },
    });

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      entity_type: ENTITY_CONTACT,
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
    return resError({ developer_msg: `saveContactMapping failed: ${error}` });
  }
};
