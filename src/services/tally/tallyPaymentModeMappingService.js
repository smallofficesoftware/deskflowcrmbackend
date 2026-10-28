import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import { marketplaceAddonRecordMappingsModel } from "../../models/marketplace/marketplaceAddonRecordMappingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyId } from "./tallyAuthHelper.js";

const ADDON_CODE = "tally";
const ENTITY_PAYMENT_MODE = "payment_mode";

// Payment mode -> Tally cash/bank ledger (plans/2026-10-08-marketplace-tally-plan.txt, receipts).
// A receipt debits the ledger its payment mode maps to. Same shape as the other mapping services:
// crm_id = payment_types.id, external_ref = the Tally ledger name. An unmapped mode still sends -
// it falls back to "Cash" for a cash mode, otherwise the mode's own name - this list just lets the
// accountant point a mode at their real bank ledger instead.

const defaultLedger = (name) => (/cash/i.test(name || "") ? "Cash" : name || "");

/** Every CRM payment mode with its Tally ledger, or the default the push would use. */
export const listPaymentModeMappings = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const types = await paymentTypeModel(req.tenantDB).findAll({ where: { isDelete: 0 }, attributes: ["id", "payment_type_name"], raw: true });
    const mappings = await marketplaceAddonRecordMappingsModel(req.tenantDB).findAll({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_PAYMENT_MODE, isDelete: 0 },
      raw: true,
    });
    const byId = new Map(mappings.map((m) => [m.crm_id, m]));

    const items = types.map((t) => {
      const mapping = byId.get(t.id);
      return {
        crm_id: t.id,
        label: t.payment_type_name,
        external_ref: mapping?.external_ref || defaultLedger(t.payment_type_name),
        match_confidence: mapping?.match_confidence || "default",
        is_confirmed: Boolean(mapping?.is_confirmed),
      };
    });
    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `listPaymentModeMappings failed: ${error}` });
  }
};

/** Confirm or edit the Tally ledger one payment mode posts to. */
export const savePaymentModeMapping = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const { crm_id, external_ref, is_confirmed } = req.body || {};
    if (!crm_id || !String(external_ref || "").trim()) {
      return resBadRequest({ developer_msg: "crm_id and external_ref are required" });
    }

    const model = marketplaceAddonRecordMappingsModel(req.tenantDB);
    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_PAYMENT_MODE, crm_id, isDelete: 0 },
    });
    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      entity_type: ENTITY_PAYMENT_MODE,
      crm_id,
      external_ref: String(external_ref).trim(),
      match_confidence: "manual",
      is_confirmed: is_confirmed ? 1 : existing?.is_confirmed || 0,
      direction: existing?.direction || "both",
      modified_date: new Date(),
    };
    const row = existing ? await existing.update(fields) : await model.create(fields);
    return resSuccess({ data: { item: row } });
  } catch (error) {
    return resError({ developer_msg: `savePaymentModeMapping failed: ${error}` });
  }
};
