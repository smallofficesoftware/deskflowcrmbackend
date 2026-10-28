import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { marketplaceAddonFieldMappingsModel } from "../../models/marketplace/marketplaceAddonFieldMappingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyId } from "./tallyAuthHelper.js";
import { CUSTOM_COLUMN_PATTERN, FORM_SALES_INVOICE, STANDARD_INVOICE_COLUMNS, normalizeUdfName } from "./tallyFieldMapping.js";

const ADDON_CODE = "tally";

// Custom fields / UDFs (plan 4.6): which CRM field feeds which UDF the customer created in Tally. Only sales
// invoices -> vouchers for now (receipts have no custom fields in the CRM; ledgers are only created, never altered).

/** The custom fields of the company's Sales Invoice form that can actually hold a value on a cart row. */
export const loadInvoiceCustomFields = async (tenantDB, company_masters_id) => {
  const rows = await customFieldFormModel(tenantDB).findAll({
    where: { company_masters_id, form_type: FORM_SALES_INVOICE, isDelete: 0 },
    attributes: ["id", "title", "reference_column_name", "display_order"],
    order: [["display_order", "ASC"], ["id", "ASC"]],
    raw: true,
  });
  return rows.filter((r) => CUSTOM_COLUMN_PATTERN.test(String(r.reference_column_name ?? "")));
};

/** Active mappings for sales invoices (what the voucher builder reads). */
export const loadInvoiceFieldMappings = (tenantDB, company_masters_id) =>
  marketplaceAddonFieldMappingsModel(tenantDB).findAll({
    where: { company_masters_id, addon_code: ADDON_CODE, form_type: FORM_SALES_INVOICE, isDelete: 0, isActive: 1 },
    order: [["id", "ASC"]],
    raw: true,
  });

const sourceChoices = (customFields) => [
  ...customFields.map((f) => ({ source_type: "custom_field", source_ref: String(f.id), label: f.title || f.reference_column_name, group: "Custom field" })),
  ...STANDARD_INVOICE_COLUMNS.map((c) => ({ source_type: "column", source_ref: c.ref, label: c.label, group: "Standard field" })),
];

/** Every CRM field an invoice UDF can take, each with the Tally UDF name it is mapped to (if any). */
export const listFieldMappings = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const customFields = await loadInvoiceCustomFields(req.tenantDB, company_masters_id);
    const saved = await marketplaceAddonFieldMappingsModel(req.tenantDB).findAll({
      where: { company_masters_id, addon_code: ADDON_CODE, form_type: FORM_SALES_INVOICE, isDelete: 0 },
      raw: true,
    });
    const bySource = new Map(saved.map((m) => [`${m.source_type}:${m.source_ref}`, m]));

    const items = sourceChoices(customFields).map((c) => {
      const m = bySource.get(`${c.source_type}:${c.source_ref}`);
      return { ...c, external_field_name: m?.external_field_name || "", is_active: m ? Boolean(m.isActive) : false };
    });
    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `listFieldMappings failed: ${error}` });
  }
};

/** Map one CRM field to a Tally UDF, switch it off, or (blank name) remove it. */
export const saveFieldMapping = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const { source_type, source_ref, external_field_name, is_active } = req.body || {};
    const customFields = await loadInvoiceCustomFields(req.tenantDB, company_masters_id);
    const choice = sourceChoices(customFields).find((c) => c.source_type === source_type && c.source_ref === String(source_ref));
    if (!choice) return resBadRequest({ ack_msg: "That field cannot be mapped.", developer_msg: "source_type/source_ref is not an available invoice field" });

    const rawName = String(external_field_name ?? "").trim();
    const model = marketplaceAddonFieldMappingsModel(req.tenantDB);
    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, form_type: FORM_SALES_INVOICE, source_type, source_ref: String(source_ref), isDelete: 0 },
    });

    if (!rawName) {
      if (existing) await existing.update({ isDelete: 1, isActive: 0, modified_date: new Date() });
      return resSuccess({ data: { item: { ...choice, external_field_name: "", is_active: false } } });
    }

    const name = normalizeUdfName(rawName);
    if (!name) {
      return resBadRequest({
        ack_msg: "Use the UDF's name exactly as in Tally: letters, digits and underscores only (spaces become underscores), starting with a letter.",
        developer_msg: "external_field_name is not a valid UDF tag name",
      });
    }

    // One Tally field can only carry one value, so two CRM fields may not share a UDF.
    const sameName = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, form_type: FORM_SALES_INVOICE, external_field_name: name, isDelete: 0 },
    });
    if (sameName && (!existing || sameName.id !== existing.id)) {
      return resBadRequest({ ack_msg: `The Tally field "${name}" is already used by another CRM field.`, developer_msg: "duplicate external_field_name" });
    }

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      form_type: FORM_SALES_INVOICE,
      source_type,
      source_ref: String(source_ref),
      external_field_name: name,
      direction: "push",
      transform: "none",
      isActive: is_active === false ? 0 : 1,
      modified_date: new Date(),
    };
    const row = existing ? await existing.update(fields) : await model.create(fields);
    return resSuccess({ data: { item: { ...choice, external_field_name: name, is_active: Boolean(row.isActive) } } });
  } catch (error) {
    return resError({ developer_msg: `saveFieldMapping failed: ${error}` });
  }
};
