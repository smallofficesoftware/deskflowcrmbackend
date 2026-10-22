import { marketplaceAddonRecordMappingsModel } from "../../models/marketplace/marketplaceAddonRecordMappingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "tally";
const ENTITY_VOUCHER_TYPE = "voucher_type";

// Voucher type mapping (plans/2026-10-08-marketplace-tally-plan.txt Q6's
// default list: Sales, Purchase, Credit Note, Debit Note, Receipt, Payment).
// Unlike products/contacts, voucher types are a small FIXED set, not rows in
// a CRM table - so there is no crm_id (per-row numeric id); each one is
// identified by crm_ref (the string slot this schema already has for
// non-numeric CRM-side keys, per 4.1). Quotations/orders/dispatch/inward
// (4.7's later slices) are deliberately NOT included here yet - 4.7 phases
// them in after invoices and receipts.
//
// Cart type codes per utils/AppEnumeration.js + plan section 3.5 (sales
// return/purchase return map to Tally's Credit Note/Debit Note per Q6).
// Receipt/Payment are account_transactions payment types, not cart types -
// included here as their own crm_ref codes since Q6 names them explicitly.
const DEFAULT_VOUCHER_TYPES = [
  { crm_ref: "sales_invoice", label: "Sales Invoice (cart type 3)", default_external_ref: "Sales" },
  { crm_ref: "purchase_invoice", label: "Purchase Invoice (cart type 4)", default_external_ref: "Purchase" },
  { crm_ref: "sales_return", label: "Sales Return (cart type 6)", default_external_ref: "Credit Note" },
  { crm_ref: "purchase_return", label: "Purchase Return (cart type 7)", default_external_ref: "Debit Note" },
  { crm_ref: "receipt", label: "Receipt (account_transactions)", default_external_ref: "Receipt" },
  { crm_ref: "payment", label: "Payment (account_transactions)", default_external_ref: "Payment" },
];

/** List the fixed voucher-type slots with their current mapping, or the Q6 default suggestion if unmapped. */
export const listVoucherTypeMappings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const mappings = await marketplaceAddonRecordMappingsModel(req.tenantDB).findAll({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_VOUCHER_TYPE, isDelete: 0 },
      raw: true,
    });
    const mappingByCrmRef = new Map(mappings.map((m) => [m.crm_ref, m]));

    const items = DEFAULT_VOUCHER_TYPES.map((v) => {
      const mapping = mappingByCrmRef.get(v.crm_ref);
      return {
        crm_ref: v.crm_ref,
        label: v.label,
        external_ref: mapping?.external_ref || v.default_external_ref,
        match_confidence: mapping?.match_confidence || "default",
        is_confirmed: Boolean(mapping?.is_confirmed),
      };
    });

    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `listVoucherTypeMappings failed: ${error}` });
  }
};

/** Confirm or edit one voucher type's Tally voucher type name. */
export const saveVoucherTypeMapping = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { crm_ref, external_ref, is_confirmed } = req.body || {};
    if (!crm_ref) {
      return resBadRequest({ developer_msg: "crm_ref is required" });
    }

    const model = marketplaceAddonRecordMappingsModel(req.tenantDB);
    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_VOUCHER_TYPE, crm_ref, isDelete: 0 },
    });

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      entity_type: ENTITY_VOUCHER_TYPE,
      crm_ref,
      external_ref,
      match_confidence: "manual",
      is_confirmed: is_confirmed ? 1 : existing?.is_confirmed || 0,
      direction: existing?.direction || "both",
      modified_date: new Date(),
    };

    const row = existing ? await existing.update(fields) : await model.create(fields);

    return resSuccess({ data: { item: row } });
  } catch (error) {
    return resError({ developer_msg: `saveVoucherTypeMapping failed: ${error}` });
  }
};
