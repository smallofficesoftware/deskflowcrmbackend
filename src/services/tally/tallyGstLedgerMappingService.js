import { Op } from "sequelize";
import { productModel } from "../../models/product_settings/productModel.js";
import { taxModel } from "../../models/product_settings/taxModel.js";
import { marketplaceAddonRecordMappingsModel } from "../../models/marketplace/marketplaceAddonRecordMappingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "tally";
const ENTITY_GST_LEDGER = "gst_ledger";

// GST ledger mapping (plans/2026-10-08-marketplace-tally-plan.txt Q6 +
// 22-10-2026 design note). One CRM tax rate (tax_masters row) needs up to 6
// Tally ledger slots - Output/Input x CGST/SGST/IGST - not 1, since Tally has
// no single "18% ledger": same-state splits CGST+SGST, different-state uses
// IGST (same split the CRM's own Miracle integration already does at
// calculation time, see miracleService.js). crm_id = tax_masters.id (which
// rate), crm_ref = the duty-type slot key - together they identify each of
// the 6 rows per rate, same idea as voucher types' crm_ref-only rows but with
// a real CRM row behind it here.
const DUTY_SLOTS = [
  { crm_ref: "output_cgst", label: "Output CGST", half_rate: true },
  { crm_ref: "output_sgst", label: "Output SGST", half_rate: true },
  { crm_ref: "output_igst", label: "Output IGST", half_rate: false },
  { crm_ref: "input_cgst", label: "Input CGST", half_rate: true },
  { crm_ref: "input_sgst", label: "Input SGST", half_rate: true },
  { crm_ref: "input_igst", label: "Input IGST", half_rate: false },
];

const defaultLedgerName = (slot, ratePercent) => {
  const pct = slot.half_rate ? ratePercent / 2 : ratePercent;
  const sideLabel = slot.label.startsWith("Output") ? slot.label : slot.label;
  return `${sideLabel} @${pct}%`;
};

/** List every CRM tax rate x the 6 duty slots, with current mapping or the default suggestion. */
export const listGstLedgerMappings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    // No company_masters_id filter here, by design (per the user, 22-10-2026):
    // the tenant DB is already one-company-scoped, and production code
    // resolving gst_id/purchase_gst_id (productServices.js:1822) reads
    // tax_masters the same way - where: { isDelete: 0 } only.
    const allRates = await taxModel(req.tenantDB).findAll({
      where: { isDelete: 0 },
      attributes: ["id", "name", "value"],
      raw: true,
    });

    // Checked in the DB (22-10-2026): products.gst_id/purchase_gst_id are the
    // ONLY two columns anywhere that reference tax_masters - so a rate that
    // no product actually uses is orphaned data (e.g. a company's own
    // mistaken "CGST"/"SGST" Tax Master entries, never picked by any
    // product), not a real combined rate to split into 6 ledgers. Only
    // process rates at least one product actually references.
    const products = await productModel(req.tenantDB).findAll({
      where: { isDelete: 0, [Op.or]: [{ gst_id: { [Op.gt]: 0 } }, { purchase_gst_id: { [Op.gt]: 0 } }] },
      attributes: ["gst_id", "purchase_gst_id"],
      raw: true,
    });
    const usedRateIds = new Set();
    for (const p of products) {
      if (p.gst_id) usedRateIds.add(p.gst_id);
      if (p.purchase_gst_id) usedRateIds.add(p.purchase_gst_id);
    }
    const rates = allRates.filter((r) => usedRateIds.has(r.id));

    const mappings = await marketplaceAddonRecordMappingsModel(req.tenantDB).findAll({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_GST_LEDGER, isDelete: 0 },
      raw: true,
    });
    const mappingByKey = new Map(mappings.map((m) => [`${m.crm_id}:${m.crm_ref}`, m]));

    const items = [];
    for (const rate of rates) {
      const ratePercent = Number(rate.value) || 0;
      for (const slot of DUTY_SLOTS) {
        const mapping = mappingByKey.get(`${rate.id}:${slot.crm_ref}`);
        items.push({
          crm_id: rate.id,
          crm_ref: slot.crm_ref,
          tax_rate_label: rate.name,
          tax_rate_value: ratePercent,
          duty_label: slot.label,
          external_ref: mapping?.external_ref || defaultLedgerName(slot, ratePercent),
          match_confidence: mapping?.match_confidence || "default",
          is_confirmed: Boolean(mapping?.is_confirmed),
        });
      }
    }

    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `listGstLedgerMappings failed: ${error}` });
  }
};

/** Confirm or edit one tax rate's one duty-slot Tally ledger name. */
export const saveGstLedgerMapping = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { crm_id, crm_ref, external_ref, is_confirmed } = req.body || {};
    if (!crm_id || !crm_ref) {
      return resBadRequest({ developer_msg: "crm_id and crm_ref are required" });
    }
    if (!DUTY_SLOTS.some((s) => s.crm_ref === crm_ref)) {
      return resBadRequest({ developer_msg: `Unknown duty slot '${crm_ref}'` });
    }

    const model = marketplaceAddonRecordMappingsModel(req.tenantDB);
    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, entity_type: ENTITY_GST_LEDGER, crm_id, crm_ref, isDelete: 0 },
    });

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      entity_type: ENTITY_GST_LEDGER,
      crm_id,
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
    return resError({ developer_msg: `saveGstLedgerMapping failed: ${error}` });
  }
};
