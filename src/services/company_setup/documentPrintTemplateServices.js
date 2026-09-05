import fs from "fs";
import moment from "moment";
import path from "path";
import { Op } from "sequelize";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { documentPrintTemplateVersionModel } from "../../models/company_setup/documentPrintTemplateVersionModel.js";
import systemDocumentTemplateModel from "../../models/company_setup/systemDocumentTemplateModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { numberToWordsCurrency } from "../../utils/numberToWordsCurrency.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { generateQuotationPdf } from "../pdfmeEngine/generateDocument.js";
import { sniffImageMime } from "../pdfmeEngine/imageOverlay.js";
import { getSampleDataForPreview } from "../pdfmeEngine/orderInputMapper.js";
import { applyTemplateOptions } from "../pdfmeEngine/templates.js";
import { logAuditEvent } from "./auditLogServices.js";

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

    const companyRow = await companyModel.findOne({ where: { id: company_masters_id, isDelete: 0 } });
    if (!companyRow) {
      return resError({ developer_msg: "Company not found" });
    }

    const company = {
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
