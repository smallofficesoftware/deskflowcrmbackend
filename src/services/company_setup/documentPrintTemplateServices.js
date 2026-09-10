import fs from "fs";
import moment from "moment";
import path from "path";
import QRCode from "qrcode";
import { Op } from "sequelize";
import { getTenantDB } from "../../config/dbManager.js";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { employeeAccountTransactionsModel } from "../../models/activities/employeeAccountTransactionModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { documentPrintTemplateVersionModel } from "../../models/company_setup/documentPrintTemplateVersionModel.js";
import { printSettingModel } from "../../models/company_setup/printSettingModel.js";
import systemDocumentTemplateModel from "../../models/company_setup/systemDocumentTemplateModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { countryModel } from "../../models/masters/countryModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { WEBSITE_LEAD_HANDLE_DB_NAME } from "../../utils/appConstants.js";
import { numberToWordsCurrency } from "../../utils/numberToWordsCurrency.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { generateAccountStatementPdf } from "../pdfmeEngine/accountStatementGenerate.js";
import { generateAccountTransactionPdf } from "../pdfmeEngine/accountTransactionGenerate.js";
import { generateEmployeeAccountStatementPdf } from "../pdfmeEngine/employeeAccountStatementGenerate.js";
import { generateEmployeeAccountTransactionPdf } from "../pdfmeEngine/employeeAccountTransactionGenerate.js";
import { generateQuotationPdf } from "../pdfmeEngine/generateDocument.js";
import { sniffImageMime } from "../pdfmeEngine/imageOverlay.js";
import { getSampleDataForPreview } from "../pdfmeEngine/orderInputMapper.js";
import { generateShippingLabelPdf } from "../pdfmeEngine/shippingLabelGenerate.js";
import { generateTaskDueListPdf } from "../pdfmeEngine/taskDueListGenerate.js";
import { applyTemplateOptions } from "../pdfmeEngine/templates.js";
import { logAuditEvent } from "./auditLogServices.js";

function formatAccountTransactionDateAndTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAccountTransactionNumber(num) {
  if (num === null || num === undefined) return "";
  return Number(num).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

// resolveCompanyForPdf's shape (name/address/mobile/email/gstin) vs the
// company_name/address/company_contact/company_email/gst_number shape
// accountTransactionGenerate.js/accountStatementGenerate.js/employee*
// expect — same raw company row, two different field-naming conventions
// already baked into each generator.
function mapCompanyToLegacyShape(company) {
  return {
    company_name: company.name,
    address: company.address,
    company_contact: company.mobile,
    company_email: company.email,
    gst_number: company.gstin,
  };
}

const now = () => moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

const nextDisplayOrder = async (Template, company_masters_id, doc_type) => {
  const max = await Template.max("display_order", { where: { company_masters_id, doc_type, isDelete: 0 } });
  return (Number(max) || 0) + 1;
};

const nextVersionNumber = async (Version, document_template_id) => {
  const max = await Version.max("version_number", { where: { document_template_id } });
  return (Number(max) || 0) + 1;
};

// Company-wide list across every doc_type — used by the "Document Designer
// Page" custom field type (data_type 14, orderInputMapper.js's
// buildExtraPages) picker, which attaches ANY of a company's own saved
// templates (quotation, shippingLabel, whatever) as a static extra page, not
// one scoped doc_type like listDocumentTemplates above.
export const listAllDocumentTemplates = async (req) => {
  try {
    const { company_masters_id } = req.body || {};
    if (!company_masters_id) {
      return resError({ developer_msg: "company_masters_id is required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const rows = await Template.findAll({
      where: { company_masters_id, isDelete: 0, published_template_json: { [Op.ne]: null } },
      attributes: ["id", "doc_type", "template_name", "is_default"],
      order: [["doc_type", "ASC"], ["display_order", "ASC"], ["id", "ASC"]],
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const listDocumentTemplates = async (req) => {
  try {
    const { company_masters_id, doc_type } = req.body || {};
    if (!company_masters_id || !doc_type) {
      return resError({ developer_msg: "company_masters_id and doc_type are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const rows = await Template.findAll({
      // template_purpose 'extra_page' rows (Document Designer Page custom
      // field sources) are deliberately excluded — this same list backs
      // both /document-designer's own sidebar AND the real print-time
      // template picker (orderPrintController.ts's fetchPdfmeTemplatesFor
      // Picker hits this identical endpoint), so an extra_page row showing
      // here would be selectable as an actual order's print layout.
      where: { company_masters_id, doc_type, template_purpose: "main", isDelete: 0 },
      attributes: ["id", "template_name", "is_default", "display_order", "has_unpublished_changes"],
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getDocumentTemplate = async (req) => {
  try {
    const { company_masters_id, doc_type, id } = req.body || {};
    if (!company_masters_id) {
      return resError({ developer_msg: "company_masters_id is required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    // An explicit id (editing a known template, extra_page or main) is
    // trusted as-is; the is_default fallback (real print-time resolution
    // with no id given) is scoped to 'main' — belt-and-suspenders, since
    // createDocumentTemplate above already never sets is_default:1 on an
    // extra_page row.
    const where = id
      ? { id, company_masters_id, isDelete: 0 }
      : { company_masters_id, doc_type, template_purpose: "main", is_default: 1, isDelete: 0 };

    const row = await Template.findOne({ where });
    if (!row) {
      return resError({ developer_msg: "Template not found" });
    }

    return resSuccess({ data: { item: row } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const createDocumentTemplate = async (req) => {
  try {
    const { company_masters_id, doc_type, template_name, template_json, a_application_login_id } = req.body || {};
    if (!company_masters_id || !doc_type || !template_name || !template_json) {
      return resError({ developer_msg: "company_masters_id, doc_type, template_name and template_json are required" });
    }
    // 'main' (default) unless the caller explicitly asks for one of the two
    // non-pickable purposes — 'extra_page' from the "Document Designer
    // Page" custom field's editor, 'product_page' from the Product Page
    // Designer editor (both share CustomFieldDesignerPageEditorView.tsx's
    // pattern, just pointed at a different save target).
    const template_purpose = ["extra_page", "product_page"].includes(req.body?.template_purpose)
      ? req.body.template_purpose
      : "main";

    const Template = documentPrintTemplateModel(req.tenantDB);
    const Version = documentPrintTemplateVersionModel(req.tenantDB);
    const jsonString = typeof template_json === "string" ? template_json : JSON.stringify(template_json);

    // Scoped to 'main' rows only — an extra_page row must never itself
    // become "the" is_default (it's not a real print layout, and it must
    // never affect whether a genuine first 'main' template becomes default
    // either).
    const existingMainCount =
      template_purpose === "main"
        ? await Template.count({ where: { company_masters_id, doc_type, template_purpose: "main", isDelete: 0 } })
        : 1;
    const display_order = await nextDisplayOrder(Template, company_masters_id, doc_type);
    const formattedDateTime = now();

    const created = await Template.create({
      company_masters_id,
      doc_type,
      template_name,
      template_purpose,
      draft_template_json: jsonString,
      published_template_json: jsonString,
      has_unpublished_changes: 0,
      is_default: template_purpose === "main" && existingMainCount === 0 ? 1 : 0,
      display_order,
      modify_by: a_application_login_id,
      created_date_time: formattedDateTime,
    });

    await Version.create({
      document_template_id: created.id,
      version_number: 1,
      template_json: jsonString,
      modify_by: a_application_login_id,
      created_date_time: formattedDateTime,
    });

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "create",
      entity_type: "document_print_template",
      entity_id: created.id,
      details: { template_name, doc_type },
    });

    return resSuccess({ data: { item: created }, ack_msg: "Template created successfully" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const updateDocumentTemplate = async (req) => {
  try {
    const { id, company_masters_id, template_name, template_json, a_application_login_id } = req.body || {};
    if (!id || !company_masters_id) {
      return resError({ developer_msg: "id and company_masters_id are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const updatePayload = {
      modify_by: a_application_login_id,
      modified_date: now(),
    };

    if (template_name !== undefined) updatePayload.template_name = template_name;
    if (template_json !== undefined) {
      updatePayload.draft_template_json = typeof template_json === "string" ? template_json : JSON.stringify(template_json);
      updatePayload.has_unpublished_changes = 1;
    }
    // Product Page Designer toggle — per-template (DocumentDesignerView.tsx's
    // toolbar checkbox, cart-shaped doc types only), not a draft/publish
    // concept, applies immediately.
    if (req.body?.include_product_pages !== undefined) {
      updatePayload.include_product_pages = req.body.include_product_pages ? 1 : 0;
    }

    const [affected] = await Template.update(updatePayload, { where: { id, company_masters_id, isDelete: 0 } });
    if (!affected) {
      return resError({ developer_msg: "Template not found" });
    }

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "update",
      entity_type: "document_print_template",
      entity_id: id,
    });

    return resSuccess({ ack_msg: "Template updated successfully" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Mirrors the POC's /api/templates/:id/apply-options — applies header/column/pageSize
// changes straight to the draft, same "live on canvas" feel, still draft-only.
export const applyOptionsToDraft = async (req) => {
  try {
    const { id, company_masters_id, doc_type, header, columnOptions, pageSize, a_application_login_id } = req.body || {};
    if (!id || !company_masters_id) {
      return resError({ developer_msg: "id and company_masters_id are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const row = await Template.findOne({ where: { id, company_masters_id, isDelete: 0 } });
    if (!row) {
      return resError({ developer_msg: "Template not found" });
    }

    const currentDraft = JSON.parse(row.draft_template_json);
    const updated = applyTemplateOptions(doc_type, currentDraft, { header, columnOptions, pageSize });
    const jsonString = JSON.stringify(updated);

    await Template.update(
      { draft_template_json: jsonString, has_unpublished_changes: 1, modify_by: a_application_login_id, modified_date: now() },
      { where: { id, company_masters_id } }
    );

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "apply_options",
      entity_type: "document_print_template",
      entity_id: id,
    });

    return resSuccess({ data: { item: updated } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const publishDocumentTemplate = async (req) => {
  try {
    const { id, company_masters_id, a_application_login_id } = req.body || {};
    if (!id || !company_masters_id) {
      return resError({ developer_msg: "id and company_masters_id are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const Version = documentPrintTemplateVersionModel(req.tenantDB);
    const row = await Template.findOne({ where: { id, company_masters_id, isDelete: 0 } });
    if (!row) {
      return resError({ developer_msg: "Template not found" });
    }

    const formattedDateTime = now();
    await Template.update(
      {
        published_template_json: row.draft_template_json,
        has_unpublished_changes: 0,
        modify_by: a_application_login_id,
        modified_date: formattedDateTime,
      },
      { where: { id, company_masters_id } }
    );

    const version_number = await nextVersionNumber(Version, id);
    await Version.create({
      document_template_id: id,
      version_number,
      template_json: row.draft_template_json,
      modify_by: a_application_login_id,
      created_date_time: formattedDateTime,
    });

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "publish",
      entity_type: "document_print_template",
      entity_id: id,
      details: { version_number },
    });

    return resSuccess({ ack_msg: "Template published successfully", data: { item: { version_number } } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const discardDraftChanges = async (req) => {
  try {
    const { id, company_masters_id, a_application_login_id } = req.body || {};
    if (!id || !company_masters_id) {
      return resError({ developer_msg: "id and company_masters_id are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const row = await Template.findOne({ where: { id, company_masters_id, isDelete: 0 } });
    if (!row) {
      return resError({ developer_msg: "Template not found" });
    }

    await Template.update(
      {
        draft_template_json: row.published_template_json,
        has_unpublished_changes: 0,
        modify_by: a_application_login_id,
        modified_date: now(),
      },
      { where: { id, company_masters_id } }
    );

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "discard_draft",
      entity_type: "document_print_template",
      entity_id: id,
    });

    return resSuccess({ ack_msg: "Draft changes discarded" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const reorderDocumentTemplates = async (req) => {
  try {
    const { company_masters_id, doc_type, orderedIds } = req.body || {};
    if (!company_masters_id || !doc_type || !Array.isArray(orderedIds)) {
      return resError({ developer_msg: "company_masters_id, doc_type and orderedIds are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    await Promise.all(
      orderedIds.map((id, index) =>
        Template.update(
          { display_order: index },
          { where: { id, company_masters_id, doc_type, isDelete: 0 } }
        )
      )
    );

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "reorder",
      entity_type: "document_print_template",
      entity_id: null,
      details: { doc_type, orderedIds },
    });

    return resSuccess({ ack_msg: "Reordered successfully" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const setDefaultDocumentTemplate = async (req) => {
  try {
    const { id, company_masters_id, doc_type } = req.body || {};
    if (!id || !company_masters_id || !doc_type) {
      return resError({ developer_msg: "id, company_masters_id and doc_type are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    await Template.update(
      { is_default: 0 },
      { where: { company_masters_id, doc_type, isDelete: 0 } }
    );
    await Template.update(
      { is_default: 1 },
      { where: { id, company_masters_id, doc_type, isDelete: 0 } }
    );

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "set_default",
      entity_type: "document_print_template",
      entity_id: id,
    });

    return resSuccess({ ack_msg: "Default template updated" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteDocumentTemplate = async (req) => {
  try {
    const { id, company_masters_id, doc_type } = req.body || {};
    if (!id || !company_masters_id || !doc_type) {
      return resError({ developer_msg: "id, company_masters_id and doc_type are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const remaining = await Template.findAll({
      where: { company_masters_id, doc_type, isDelete: 0 },
      attributes: ["id", "is_default", "display_order"],
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });

    if (remaining.length <= 1) {
      return resError({ developer_msg: "Cannot delete the last remaining template for this document type" });
    }

    const target = remaining.find((r) => r.id === Number(id));
    if (!target) {
      return resError({ developer_msg: "Template not found" });
    }

    await Template.update({ isDelete: 1, modified_date: now() }, { where: { id, company_masters_id } });

    if (target.is_default) {
      const nextDefault = remaining.find((r) => r.id !== target.id);
      if (nextDefault) {
        await Template.update({ is_default: 1 }, { where: { id: nextDefault.id } });
      }
    }

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "delete",
      entity_type: "document_print_template",
      entity_id: id,
    });

    return resSuccess({ ack_msg: "Template deleted successfully" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const listTemplateVersions = async (req) => {
  try {
    const { document_template_id } = req.body || {};
    if (!document_template_id) {
      return resError({ developer_msg: "document_template_id is required" });
    }

    const Version = documentPrintTemplateVersionModel(req.tenantDB);
    const rows = await Version.findAll({
      where: { document_template_id },
      attributes: ["version_number", "change_note", "modify_by", "created_date_time"],
      order: [["version_number", "DESC"]],
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const restoreTemplateVersion = async (req) => {
  try {
    const { document_template_id, version_number, company_masters_id, a_application_login_id } = req.body || {};
    if (!document_template_id || !version_number || !company_masters_id) {
      return resError({ developer_msg: "document_template_id, version_number and company_masters_id are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const Version = documentPrintTemplateVersionModel(req.tenantDB);

    const targetVersion = await Version.findOne({ where: { document_template_id, version_number } });
    if (!targetVersion) {
      return resError({ developer_msg: "Version not found" });
    }

    const formattedDateTime = now();
    await Template.update(
      {
        draft_template_json: targetVersion.template_json,
        published_template_json: targetVersion.template_json,
        has_unpublished_changes: 0,
        modify_by: a_application_login_id,
        modified_date: formattedDateTime,
      },
      { where: { id: document_template_id, company_masters_id } }
    );

    const newVersionNumber = await nextVersionNumber(Version, document_template_id);
    await Version.create({
      document_template_id,
      version_number: newVersionNumber,
      template_json: targetVersion.template_json,
      change_note: `restored from version ${version_number}`,
      modify_by: a_application_login_id,
      created_date_time: formattedDateTime,
    });

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "restore_version",
      entity_type: "document_print_template",
      entity_id: document_template_id,
      details: { restored_from: version_number, new_version: newVersionNumber },
    });

    return resSuccess({ ack_msg: "Version restored successfully" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const duplicateDocumentTemplate = async (req) => {
  try {
    const { id, company_masters_id, doc_type, a_application_login_id } = req.body || {};
    if (!id || !company_masters_id || !doc_type) {
      return resError({ developer_msg: "id, company_masters_id and doc_type are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const Version = documentPrintTemplateVersionModel(req.tenantDB);

    const source = await Template.findOne({ where: { id, company_masters_id, isDelete: 0 } });
    if (!source) {
      return resError({ developer_msg: "Template not found" });
    }

    const formattedDateTime = now();
    const display_order = await nextDisplayOrder(Template, company_masters_id, doc_type);

    const created = await Template.create({
      company_masters_id,
      doc_type,
      template_name: `${source.template_name} (Copy)`,
      draft_template_json: source.draft_template_json,
      published_template_json: source.published_template_json,
      has_unpublished_changes: source.has_unpublished_changes,
      is_default: 0,
      display_order,
      modify_by: a_application_login_id,
      created_date_time: formattedDateTime,
    });

    await Version.create({
      document_template_id: created.id,
      version_number: 1,
      template_json: created.published_template_json,
      modify_by: a_application_login_id,
      created_date_time: formattedDateTime,
    });

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "duplicate",
      entity_type: "document_print_template",
      entity_id: created.id,
      details: { source_id: id },
    });

    return resSuccess({ data: { item: created }, ack_msg: "Template duplicated successfully" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const exportDocumentTemplate = async (req) => {
  try {
    const { id, company_masters_id } = req.body || {};
    if (!id || !company_masters_id) {
      return resError({ developer_msg: "id and company_masters_id are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const row = await Template.findOne({
      where: { id, company_masters_id, isDelete: 0 },
      attributes: ["doc_type", "template_name", "published_template_json"],
    });
    if (!row) {
      return resError({ developer_msg: "Template not found" });
    }

    await logAuditEvent(req, {
      module_key: "document_designer",
      action: "export",
      entity_type: "document_print_template",
      entity_id: id,
    });

    return resSuccess({
      data: {
        item: {
          doc_type: row.doc_type,
          template_name: row.template_name,
          template_json: JSON.parse(row.published_template_json),
        },
      },
    });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const importDocumentTemplate = async (req) => {
  try {
    const { company_masters_id, doc_type, template_name, template_json, a_application_login_id } = req.body || {};
    if (!company_masters_id || !doc_type || !template_name || !template_json) {
      return resError({ developer_msg: "company_masters_id, doc_type, template_name and template_json are required" });
    }

    if (!template_json.basePdf || !template_json.schemas) {
      return resError({ developer_msg: "Invalid template file — missing basePdf/schemas" });
    }

    // Same write path as createDocumentTemplate — importing is just a
    // create whose starting content came from a file instead of the
    // ported default/gallery.
    req.body.template_json = template_json;
    return await createDocumentTemplate(req);
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const listSystemTemplates = async (req) => {
  try {
    const { doc_type } = req.body || {};
    if (!doc_type) {
      return resError({ developer_msg: "doc_type is required" });
    }

    const rows = await systemDocumentTemplateModel.findAll({
      where: { doc_type, isDelete: 0 },
      attributes: ["id", "template_name", "description", "display_order"],
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// The one place a service needs both connections at once: the master
// connection to read the gallery row, req.tenantDB to write the copy.
export const copyFromSystemTemplate = async (req) => {
  try {
    const { system_template_id, doc_type, company_masters_id, a_application_login_id } = req.body || {};
    if (!system_template_id || !doc_type || !company_masters_id) {
      return resError({ developer_msg: "system_template_id, doc_type and company_masters_id are required" });
    }

    const systemTemplate = await systemDocumentTemplateModel.findOne({
      where: { id: system_template_id, doc_type, isDelete: 0 },
    });
    if (!systemTemplate) {
      return resError({ developer_msg: "Gallery template not found" });
    }

    req.body.template_name = systemTemplate.template_name;
    req.body.template_json = JSON.parse(systemTemplate.template_json);
    const result = await createDocumentTemplate(req);

    if (result?.ack === 1) {
      await logAuditEvent(req, {
        module_key: "document_designer",
        action: "copy_from_gallery",
        entity_type: "document_print_template",
        entity_id: result?.data?.item?.id,
        details: { system_template_id },
      });
    }

    return result;
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Mime sniffed from real file bytes, not hardcoded to png — a real JPEG
// mislabeled as PNG makes pdfme's image plugin call pdf-lib's embedPng and
// throw "The input is not a PNG file!", taking down the whole preview
// (same bug fixed in orderServices.js's §5 integration for the real
// /order-pdf path).
const encodeCompanyImage = (filename) => {
  if (!filename) return "";
  try {
    const image = fs.readFileSync(path.join(process.cwd(), "media-folder/company_image", filename));
    const mime = sniffImageMime(image) || "image/png";
    return `data:${mime};base64,${image.toString("base64")}`;
  } catch (e) {
    return "";
  }
};

// Product photos, not company header/logo/etc — different directory
// (encodeCompanyImage above always missed these). Mime is sniffed from the
// real file bytes, not the extension — a mislabeled/renamed file (".jpg"
// that's actually PNG bytes) makes pdf-lib's embedJpg throw "SOI not found
// in JPEG" (same bug fixed in orderServices.js's §5 integration).
const encodeProductImage = (relativePath) => {
  if (!relativePath) return "";
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), "media-folder/product-images", relativePath));
    const mime = sniffImageMime(bytes);
    if (!mime) return "";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch (e) {
    return "";
  }
};

// Shared company-header resolution — same shape previewDocumentTemplate
// builds inline below, exported so any OTHER pdfme-engine caller (e.g.
// Report Builder's exportReportPdf) can pass real company branding into
// withCompanyHeader() too instead of only Document Designer's cart docs.
export async function resolveCompanyForPdf(company_masters_id) {
  const companyRow = await companyModel.findOne({ where: { id: company_masters_id, isDelete: 0 } });
  if (!companyRow) return null;

  return {
    id: companyRow.id,
    name: companyRow.company_name,
    address: companyRow.address,
    gstin: companyRow.gst_number,
    mobile: companyRow.printed_number,
    email: companyRow.company_email,
    headerImage: encodeCompanyImage(companyRow.header_img),
    logoImage: encodeCompanyImage(companyRow.company_logo),
    footerImage: encodeCompanyImage(companyRow.footer_img),
    signImage: encodeCompanyImage(companyRow.company_sign),
    watermark_in_print: companyRow.watermark_in_print,
  };
}

// Shared by previewDocumentTemplate (a tenant's own "Generate Preview",
// against a real saved draft row) and testRunDocumentTemplate (adminpanel's
// system-gallery editor test-run, against an unsaved draft) — everything
// from resolving the company's own branding through rendering the actual
// PDF is identical between the two, only where draftTemplate/company_masters_id
// come from differs.
const renderTemplateAsPdf = async ({ req, company_masters_id, draftTemplate, cart_id, doc_type }) => {
  try {
    const company = await resolveCompanyForPdf(company_masters_id);
    if (!company) {
      return resError({ developer_msg: "Company not found" });
    }

    // accountTransaction isn't cart-shaped (no buyer/order/items) — it has
    // its own data shape (companyDetails/accountTransactions/contactDetails/
    // payment_type_name/settingDetails, see accountTransactionGenerate.js).
    // Render it via its own generator instead of falling into the
    // quotation path below, using any one real transaction + contact
    // combo from this tenant as stand-in data since there's no picker here
    // (adminpanel's test-run has no cart/transaction id to pick from).
    if (doc_type === "accountTransaction") {
      const AccountTransactionModel = accountTransactionsModel(req.tenantDB);
      const accountTransaction = await AccountTransactionModel.findOne({
        where: { isDelete: 0 },
        order: [["id", "DESC"]],
      });

      let contactDetails = {};
      let payment_type_name = null;
      if (accountTransaction) {
        const ContactModel = contactModel(req.tenantDB);
        const contactRaw = await ContactModel.findOne({
          where: { id: accountTransaction.contact_masters_id, isDelete: 0 },
          attributes: ["id", "person_name", "company_name", "mobile_number", "address", "pincode", "country", "state", "city"],
        });

        const [country, state, city] = await Promise.all([
          contactRaw?.country ? countryModel(req.tenantDB).findOne({ where: { id: contactRaw.country }, attributes: ["country_name"] }) : null,
          contactRaw?.state ? stateModel(req.tenantDB).findOne({ where: { id: contactRaw.state }, attributes: ["state_name"] }) : null,
          contactRaw?.city ? cityModel(req.tenantDB).findOne({ where: { id: contactRaw.city }, attributes: ["city_name"] }) : null,
        ]);

        contactDetails = contactRaw
          ? {
              person_name: contactRaw.person_name,
              company_name: contactRaw.company_name,
              mobile_number: contactRaw.mobile_number,
              address: contactRaw.address,
              pincode: contactRaw.pincode,
              country_name: country?.country_name || null,
              state_name: state?.state_name || null,
              city_name: city?.city_name || null,
            }
          : {};

        if (accountTransaction.mode) {
          const paymentType = await paymentTypeModel(req.tenantDB).findOne({
            where: { id: accountTransaction.mode },
            attributes: ["payment_type_name"],
          });
          payment_type_name = paymentType?.payment_type_name || null;
        }
      }

      const printSettings = await printSettingModel(req.tenantDB).findOne({
        where: { type: 12, print_version: 1, isDelete: 0 },
        attributes: ["setting_details"],
      });
      const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");

      // No real transaction in this tenant at all — fall back to a fully
      // made-up row rather than fail, so an empty test tenant still renders.
      const sampleTransaction = accountTransaction?.dataValues ?? {
        id: 0,
        type: 1,
        remark: "Sample remark",
        amount: 1000,
        payment_date_time: new Date(),
      };

      const buffer = await generateAccountTransactionPdf({
        templateOverride: draftTemplate,
        companyDetails: mapCompanyToLegacyShape(company),
        accountTransactions: sampleTransaction,
        contactDetails,
        payment_type_name,
        settingDetails,
        currencySymbol: "₹",
        formattedAmount: formatAccountTransactionNumber(sampleTransaction.amount),
        formattedDate: sampleTransaction.payment_date_time ? formatAccountTransactionDateAndTime(sampleTransaction.payment_date_time) : "-",
      });
      return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
    }

    // accountStatement — a contact's transaction history table, not a
    // single transaction. Picks any one contact with real transactions in
    // this tenant and builds a simple running-balance table from up to 10
    // of their transactions (oldest-first); a fully made-up contact +
    // 2-row table if this tenant has none at all.
    if (doc_type === "accountStatement") {
      const AccountTransactionModel = accountTransactionsModel(req.tenantDB);
      const anyTxn = await AccountTransactionModel.findOne({ where: { isDelete: 0 }, order: [["id", "DESC"]] });

      let contactData = {};
      let rowsWithBalance = [];
      let totalCredit = "0";
      let totalDebit = "0";

      if (anyTxn) {
        const transactions = await AccountTransactionModel.findAll({
          where: { contact_masters_id: anyTxn.contact_masters_id, isDelete: 0 },
          order: [["payment_date_time", "ASC"]],
          limit: 10,
        });
        let running = 0;
        let creditSum = 0;
        let debitSum = 0;
        rowsWithBalance = transactions.map((tx) => {
          const amt = Number(tx.amount) || 0;
          const isCredit = tx.type == 1;
          running += isCredit ? amt : -amt;
          if (isCredit) creditSum += amt; else debitSum += amt;
          return {
            id: tx.id,
            payment_date: tx.payment_date_time ? moment(tx.payment_date_time).format("DD-MM-YYYY") : "",
            remark: tx.remark || "",
            credit: isCredit ? formatAccountTransactionNumber(amt) : "",
            debit: !isCredit ? formatAccountTransactionNumber(amt) : "",
            balance: running.toLocaleString("en-IN"),
          };
        });
        totalCredit = creditSum.toLocaleString("en-IN");
        totalDebit = debitSum.toLocaleString("en-IN");

        const contactRaw = await contactModel(req.tenantDB).findOne({
          where: { id: anyTxn.contact_masters_id, isDelete: 0 },
          attributes: ["person_name", "company_name", "mobile_number", "email_id", "address", "shipping_address", "gst_number"],
        });
        contactData = contactRaw?.dataValues || {};
      } else {
        rowsWithBalance = [
          { id: 1, payment_date: moment().format("DD-MM-YYYY"), remark: "Sample credit", credit: "1,000", debit: "", balance: "1,000" },
          { id: 2, payment_date: moment().format("DD-MM-YYYY"), remark: "Sample debit", credit: "", debit: "400", balance: "600" },
        ];
        totalCredit = "1,000";
        totalDebit = "400";
        contactData = {
          person_name: "Sample Contact",
          company_name: "Sample Company",
          mobile_number: "9876543210",
          email_id: "sample@example.com",
          address: "Sample Address",
          shipping_address: "Sample Shipping Address",
          gst_number: "",
        };
      }

      const printSettings = await printSettingModel(req.tenantDB).findOne({
        where: { type: 12, print_version: 1, isDelete: 0 },
        attributes: ["setting_details"],
      });
      const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");

      const buffer = await generateAccountStatementPdf({
        templateOverride: draftTemplate,
        companyData: mapCompanyToLegacyShape(company),
        contactData,
        rowsWithBalance,
        totalCredit,
        totalDebit,
        lastRowBalance: rowsWithBalance.length ? rowsWithBalance[rowsWithBalance.length - 1].balance : "0",
        fromDate: rowsWithBalance[0]?.payment_date || moment().format("DD-MM-YYYY"),
        toDate: rowsWithBalance[rowsWithBalance.length - 1]?.payment_date || moment().format("DD-MM-YYYY"),
        settingDetails,
      });
      return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
    }

    // employeeAccountTransaction — Team's own variant of accountTransaction,
    // same shape otherwise (see employeeAccountTransactionGenerate.js's
    // header comment for why it's a separate generator, not a reused one).
    if (doc_type === "employeeAccountTransaction") {
      const EmployeeAccountTransactionModel = employeeAccountTransactionsModel(req.tenantDB);
      const empTxn = await EmployeeAccountTransactionModel.findOne({ where: { isDelete: 0 }, order: [["id", "DESC"]] });

      let employeeDetails = null;
      let payment_type_name = null;
      if (empTxn) {
        employeeDetails = await loginModel.findOne({ where: { id: empTxn.team_id, isDelete: 0 } });
        if (empTxn.mode) {
          const paymentType = await paymentTypeModel(req.tenantDB).findOne({
            where: { id: empTxn.mode },
            attributes: ["payment_type_name"],
          });
          payment_type_name = paymentType?.payment_type_name || null;
        }
      }

      const printSettings = await printSettingModel(req.tenantDB).findOne({
        where: { type: 12, print_version: 1, isDelete: 0 },
        attributes: ["setting_details"],
      });
      const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");

      const sampleTransaction = empTxn?.dataValues ?? {
        id: 0,
        type: 1,
        remark: "Sample remark",
        amount: 1000,
        payment_date_time: new Date(),
      };
      const sampleEmployee = employeeDetails?.dataValues ?? {
        username: "Sample Employee",
        recovery_mobile: "9876543210",
        recovery_email: "employee@example.com",
      };

      const buffer = await generateEmployeeAccountTransactionPdf({
        templateOverride: draftTemplate,
        companyDetails: mapCompanyToLegacyShape(company),
        accountTransactions: sampleTransaction,
        employeeDetails: sampleEmployee,
        payment_type_name,
        settingDetails,
        currencySymbol: "₹",
        formattedAmount: formatAccountTransactionNumber(sampleTransaction.amount),
        formattedDate: sampleTransaction.payment_date_time ? formatAccountTransactionDateAndTime(sampleTransaction.payment_date_time) : "-",
      });
      return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
    }

    // employeeAccountStatement — Team's own variant of accountStatement.
    if (doc_type === "employeeAccountStatement") {
      const EmployeeAccountTransactionModel = employeeAccountTransactionsModel(req.tenantDB);
      const anyEmpTxn = await EmployeeAccountTransactionModel.findOne({ where: { isDelete: 0 }, order: [["id", "DESC"]] });

      let employeeData = {};
      let rowsWithBalance = [];
      let totalCredit = "0";
      let totalDebit = "0";

      if (anyEmpTxn) {
        const transactions = await EmployeeAccountTransactionModel.findAll({
          where: { team_id: anyEmpTxn.team_id, isDelete: 0 },
          order: [["payment_date_time", "ASC"]],
          limit: 10,
        });
        let running = 0;
        let creditSum = 0;
        let debitSum = 0;
        rowsWithBalance = transactions.map((tx) => {
          const amt = Number(tx.amount) || 0;
          const isCredit = tx.type == 1;
          running += isCredit ? amt : -amt;
          if (isCredit) creditSum += amt; else debitSum += amt;
          return {
            id: tx.id,
            payment_date: tx.payment_date_time ? moment(tx.payment_date_time).format("DD-MM-YYYY") : "",
            remark: tx.remark || "",
            credit: isCredit ? formatAccountTransactionNumber(amt) : "",
            debit: !isCredit ? formatAccountTransactionNumber(amt) : "",
            balance: running.toLocaleString("en-IN"),
          };
        });
        totalCredit = creditSum.toLocaleString("en-IN");
        totalDebit = debitSum.toLocaleString("en-IN");

        const employeeRaw = await loginModel.findOne({ where: { id: anyEmpTxn.team_id, isDelete: 0 } });
        employeeData = employeeRaw?.dataValues || {};
      } else {
        rowsWithBalance = [
          { id: 1, payment_date: moment().format("DD-MM-YYYY"), remark: "Sample credit", credit: "1,000", debit: "", balance: "1,000" },
          { id: 2, payment_date: moment().format("DD-MM-YYYY"), remark: "Sample debit", credit: "", debit: "400", balance: "600" },
        ];
        totalCredit = "1,000";
        totalDebit = "400";
        employeeData = { username: "Sample Employee", recovery_mobile: "9876543210", recovery_email: "employee@example.com" };
      }

      const printSettings = await printSettingModel(req.tenantDB).findOne({
        where: { type: 12, print_version: 1, isDelete: 0 },
        attributes: ["setting_details"],
      });
      const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");

      const buffer = await generateEmployeeAccountStatementPdf({
        templateOverride: draftTemplate,
        companyData: mapCompanyToLegacyShape(company),
        employeeData,
        rowsWithBalance,
        totalCredit,
        totalDebit,
        lastRowBalance: rowsWithBalance.length ? rowsWithBalance[rowsWithBalance.length - 1].balance : "0",
        fromDate: rowsWithBalance[0]?.payment_date || moment().format("DD-MM-YYYY"),
        toDate: rowsWithBalance[rowsWithBalance.length - 1]?.payment_date || moment().format("DD-MM-YYYY"),
        settingDetails,
      });
      return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
    }

    // taskDueList — a team-grouped task table, not cart/contact-shaped at
    // all. Real team/status/assignment joins are significant extra work for
    // a test-run preview, so this always uses a small fabricated sample —
    // enough to see the draft's layout render with real-looking content.
    if (doc_type === "taskDueList") {
      const buffer = await generateTaskDueListPdf({
        templateOverride: draftTemplate,
        companyData: mapCompanyToLegacyShape(company),
        teamWiseTaskList: [
          {
            team_name: "Sample Team",
            tasks: [
              { id: 1, task_title: "Sample Task 1", task_remark: "Sample remark", status_name: "Pending", assinged_to_names: "Sample User", task_fromdate: moment().format("DD-MM-YYYY"), task_enddate: moment().add(2, "days").format("DD-MM-YYYY"), due_days: 2 },
              { id: 2, task_title: "Sample Task 2", task_remark: "", status_name: "In Progress", assinged_to_names: "Sample User 2", task_fromdate: moment().format("DD-MM-YYYY"), task_enddate: moment().add(5, "days").format("DD-MM-YYYY"), due_days: 5 },
            ],
          },
        ],
      });
      return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
    }

    // shippingLabel — cart-derived but not via the buyer/order/items shape
    // below (generateQuotationPdf's itemized invoice layout). Picks any one
    // real cart + its items from this tenant as stand-in data; a fabricated
    // cart if this tenant has none at all.
    if (doc_type === "shippingLabel") {
      const cartRow = await cartModel(req.tenantDB).findOne({ where: { isDelete: 0 }, order: [["id", "DESC"]] });

      let labelCart;
      let labelItems;
      if (cartRow) {
        labelCart = cartRow.dataValues;
        const [state, city] = await Promise.all([
          labelCart.state_id ? stateModel(req.tenantDB).findOne({ where: { id: labelCart.state_id }, attributes: ["state_name"] }) : null,
          labelCart.city_id ? cityModel(req.tenantDB).findOne({ where: { id: labelCart.city_id }, attributes: ["city_name"] }) : null,
        ]);
        labelCart.state_name = state?.state_name || "";
        labelCart.city_name = city?.city_name || "";
        labelItems = await cartItemModel(req.tenantDB).findAll({ where: { cart_id: cartRow.id, isDelete: 0 }, raw: true });
      } else {
        labelCart = {
          to_customer_name: "Sample Customer",
          shipping_address: "Sample Shipping Address",
          state_name: "Sample State",
          city_name: "Sample City",
          PinCode: "000000",
          to_customer_phone: "9876543210",
          sr_by_number: "SAMPLE/001",
          grand_total: 1000,
        };
        labelItems = [{ item_product_name: "Sample Item", item_qty: 1, item_total: 1000 }];
      }

      let qrDataUri = "";
      if (labelCart.sr_by_number) {
        qrDataUri = await QRCode.toDataURL(labelCart.sr_by_number.toString(), {
          margin: 1,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
      }

      const printSettings = await printSettingModel(req.tenantDB).findOne({
        where: { type: 14, print_version: 1, isDelete: 0 },
        attributes: ["setting_details"],
      });
      const printSetting = JSON.parse(printSettings?.dataValues?.setting_details || "{}");

      const buffer = await generateShippingLabelPdf({
        templateOverride: draftTemplate,
        cart: labelCart,
        company: mapCompanyToLegacyShape(company),
        items: labelItems,
        qrDataUri,
        dynamicTerms: "",
        showProductSection: !!printSetting?.ProductSection,
      });
      return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
    }

    let buyer;
    let order;
    let items;
    let cart;
    let numberTowords;
    let itemImages = [];

    if (cart_id) {
      const CartModel = cartModel(req.tenantDB);
      const CartItemModel = cartItemModel(req.tenantDB);
      const ProductModel = productModel(req.tenantDB);

      const cartRow = await CartModel.findOne({ where: { id: cart_id, isDelete: 0 } });
      if (!cartRow) {
        return resError({ developer_msg: "Order not found" });
      }
      const cartItems = await CartItemModel.findAll({ where: { cart_id, isDelete: 0 }, raw: true });
      const productIds = cartItems.map((i) => i.item_product_id);
      const products = await ProductModel.findAll({
        where: { id: productIds, isDelete: 0 },
        attributes: ["id", "product_img"],
        raw: true,
      });
      const productMap = {};
      products.forEach((p) => { productMap[p.id] = p; });

      cart = cartRow.dataValues;
      items = cartItems.map((item) => ({
        description: item.item_product_name,
        hsn: item.item_hsn_code,
        qty: item.item_unit_name ? `${item.item_qty} / ${item.item_unit_name}` : item.item_qty,
        rate: item.item_rate,
        discount: item.item_discount_pct,
        total: item.item_total,
        item_hsn_code: item.item_hsn_code,
        item_total: item.item_total,
      }));
      itemImages = cartItems.map((item) => encodeProductImage(productMap[item.item_product_id]?.product_img));
      buyer = {
        companyName: cart.to_customer_company_name,
        contactName: cart.to_customer_name,
        phone: cart.to_customer_phone,
        email: cart.to_customer_email,
        billingAddress: cart.Address,
        shippingAddress: cart.shipping_address,
        gstin: cart.to_customer_gst_number,
        supplyTo: "",
      };
      // cart.update_Date_time is a Sequelize DATE column — comes back as a
      // JS Date object, not a string. pdfme's text renderer calls .split()
      // on a field's resolved value, so an unformatted Date crashes with
      // "value.split is not a function" (same root cause fixed in
      // orderServices.js's §5 integration — this preview path duplicates
      // that field-mapping independently and needs the same fix).
      order = {
        number: cart.cart_number,
        dateTime: cart.update_Date_time ? moment(cart.update_Date_time).format("DD-MM-YYYY hh:mm A") : "",
        contactPerson: "",
      };
      numberTowords = numberToWordsCurrency(cart.grand_total ?? 0, "INR");
    } else {
      const sample = getSampleDataForPreview();
      buyer = sample.buyer;
      order = sample.order;
      items = sample.items;
      cart = sample.cart;
      numberTowords = sample.numberTowords;
      // Sample company text stays real (this company's own branding),
      // only buyer/order/item data is the placeholder set.
    }

    const buffer = await generateQuotationPdf({
      templateOverride: draftTemplate,
      company,
      buyer,
      order,
      items,
      cart,
      numberTowords,
      columnOptions: null,
      itemImages,
      customFieldRows: [],
      cartValues: cart,
      tenantDB: req.tenantDB,
    });

    return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Generate Preview (§6) — renders the currently-open template's DRAFT (not
// published), against either a real cart the designer picked or sample data
// as the empty-state fallback. Never touches /order-pdf's real generation
// path, never writes a cart's stored pdfPath — this is preview-only, no
// persistence side effects, matching §6's "preview and real print are
// allowed to diverge on purpose while editing."
export const previewDocumentTemplate = async (req) => {
  try {
    const { id, company_masters_id, cart_id } = req.body || {};
    if (!id || !company_masters_id) {
      return resError({ developer_msg: "id and company_masters_id are required" });
    }

    const Template = documentPrintTemplateModel(req.tenantDB);
    const templateRow = await Template.findOne({ where: { id, company_masters_id, isDelete: 0 } });
    if (!templateRow) {
      return resError({ developer_msg: "Template not found" });
    }
    const draftTemplate = JSON.parse(templateRow.draft_template_json);

    return renderTemplateAsPdf({ req, company_masters_id, draftTemplate, cart_id, doc_type: templateRow.doc_type });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Admin authoring test-run (Document Designer gap audit, item 2) — mirrors
// reportDefinitionServices.js's testRunReportDefinition exactly: renders a
// NOT-YET-SAVED draft (from adminpanel's system_document_templates editor)
// against WEBSITE_LEAD_HANDLE_DB_NAME, a dedicated test tenant, never a
// real customer's. Reached only via requireServiceSecret (no CRM user
// session on this request — the caller is adminpanel's own backend,
// already authenticated on its side), so this resolves its own tenantDB
// rather than trusting req.tenantDB. Always renders against sample data
// (cart_id: null) — a gallery draft has no real order to preview against,
// unlike a tenant's own "Generate Preview."
export const testRunDocumentTemplate = async (req) => {
  try {
    const { template_json, doc_type } = req.body || {};
    if (!template_json) {
      return resError({ developer_msg: "template_json is required" });
    }
    if (!WEBSITE_LEAD_HANDLE_DB_NAME) {
      return resError({ developer_msg: "WEBSITE_LEAD_HANDLE_DB_NAME is not configured — test-run is unavailable until it is" });
    }
    const tenantDBFind = await tenantMasterModel.findOne({
      where: { isDelete: 0, db_name: WEBSITE_LEAD_HANDLE_DB_NAME },
      attributes: ["a_application_login_id", "company_masters_id"],
    });
    if (!tenantDBFind) {
      return resError({ developer_msg: "Test tenant not found for WEBSITE_LEAD_HANDLE_DB_NAME" });
    }
    const tenantDB = (await getTenantDB(tenantDBFind.a_application_login_id, tenantDBFind.company_masters_id)).sequelize;
    const draftTemplate = typeof template_json === "string" ? JSON.parse(template_json) : template_json;

    return renderTemplateAsPdf({
      req: { ...req, tenantDB },
      company_masters_id: tenantDBFind.company_masters_id,
      draftTemplate,
      cart_id: null,
      doc_type,
    });
  } catch (e) {
    console.error("testRunDocumentTemplate error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
