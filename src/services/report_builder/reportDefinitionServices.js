import moment from "moment";
import { Op } from "sequelize";
import { getTenantDB } from "../../config/dbManager.js";
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { reportDefinitionModel } from "../../models/report_builder/reportDefinitionModel.js";
import { reportDefinitionTeamRightModel } from "../../models/report_builder/reportDefinitionTeamRightModel.js";
import { reportGroupModel } from "../../models/report_builder/reportGroupModel.js";
import { reportRunModel } from "../../models/report_builder/reportRunModel.js";
import systemReportDefinitionModel from "../../models/report_builder/systemReportDefinitionModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { WEBSITE_LEAD_HANDLE_DB_NAME } from "../../utils/appConstants.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { logAuditEvent } from "../company_setup/auditLogServices.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { isFeatureEnabled } from "../company_setup/featureFlagServices.js";
import { runCompositeReport } from "./compositeEngine.js";
import { getReportDataScope, setReportTeamRights } from "./dataScopeService.js";
import { getRegisteredMetric, listMetricsRegistry } from "./metricsRegistry.js";
import { getGeneralFilterMeta, getRegisteredModel, listModelRegistry } from "./modelRegistry.js";
import { getRegisteredPlugin, listPluginRegistry } from "./pluginRegistry.js";
import { runQueryReport } from "./queryEngine.js";

const now = () => moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

const asJsonString = (value) => (typeof value === "string" ? value : JSON.stringify(value));

// Mostly a static whitelist, not tenant data — company_masters_id is
// resolved only so listModelRegistry() can merge in THIS company's real
// dynamic custom-field columns (contacts/inquiries/visits/task_managements)
// alongside the fixed ones. Build routes only (same gate as create/list)
// since it's only useful to someone building a definition, not running one.
export const getModelRegistry = async (req) => {
  const { a_application_login_id } = req.body || {};
  if (!a_application_login_id) {
    return resError({ developer_msg: "a_application_login_id is required" });
  }
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId) {
    return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
  }
  const item = await listModelRegistry(req.tenantDB, findCompanyId.company_masters_id);
  return resSuccess({ data: { item } });
};

export const getPluginRegistry = async () => {
  return resSuccess({ data: { item: listPluginRegistry() } });
};

export const getMetricsRegistry = async () => {
  return resSuccess({ data: { item: listMetricsRegistry() } });
};

// Gallery browse — reads system_report_definitions off the MASTER connection
// (systemReportDefinitionModel is bound to the default `sequelize` import,
// same pattern systemDocumentTemplateModel.js already uses for Document
// Designer's own gallery). No company/tenant scoping needed — the gallery is
// the same for every company, only category/type ever filter it.
export const listSystemReportDefinitions = async (req) => {
  try {
    const { category, type } = req.body || {};
    const where = { isDelete: 0, isActive: 1 };
    if (category) where.category = category;
    if (type) where.type = type;

    const rows = await systemReportDefinitionModel.findAll({
      where,
      attributes: ["id", "name", "type", "category", "description", "priority", "display_order"],
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("listSystemReportDefinitions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// The one place a service needs both connections at once: the master
// connection to read the gallery row, req.tenantDB (via createReportDefinition)
// to write the copy — same shape copyFromSystemTemplate (Document Designer)
// already uses.
export const copyFromSystemReportDefinition = async (req) => {
  try {
    const { system_report_definition_id } = req.body || {};
    if (!system_report_definition_id) {
      return resError({ developer_msg: "system_report_definition_id is required" });
    }

    const systemDefinition = await systemReportDefinitionModel.findOne({
      where: { id: system_report_definition_id, isDelete: 0, isActive: 1 },
    });
    if (!systemDefinition) {
      return resError({ developer_msg: "Gallery report not found" });
    }

    req.body.name = systemDefinition.name;
    req.body.type = systemDefinition.type;
    req.body.model_key = systemDefinition.model_key;
    req.body.plugin_key = systemDefinition.plugin_key;
    req.body.columns_json = systemDefinition.columns_json;
    req.body.filters_json = systemDefinition.filters_json;
    req.body.group_by_json = systemDefinition.group_by_json;
    req.body.filters_to_show = systemDefinition.filters_to_show;
    req.body.description = systemDefinition.description;
    req.body.source_system_report_definition_id = systemDefinition.id;

    const result = await createReportDefinition(req);

    if (result?.ack === 1) {
      await logAuditEvent(req, {
        module_key: "report_builder",
        action: "copy_from_gallery",
        entity_type: "report_definition",
        entity_id: result?.data?.item?.id,
        details: { system_report_definition_id },
      });
    }

    return result;
  } catch (e) {
    console.error("copyFromSystemReportDefinition error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Admin authoring test-run (plan Step 1) — runs a NOT-YET-SAVED draft
// (from adminpanel's system_report_definitions editor) against
// WEBSITE_LEAD_HANDLE_DB_NAME, a dedicated test tenant DB, never a real
// customer's. Reached only via a separate service-to-service route
// (requireServiceSecret, not authenticateToken/tenantMiddleware — there
// is no CRM user session here, the caller is adminpanel's own backend),
// so this resolves its own tenantDB rather than reading req.body.
// a_application_login_id, mirroring the exact tenant_masters lookup
// companyService.js's own WEBSITE_LEAD_HANDLE_DB_NAME flows already use.
//
// No report_definitions row exists yet for this draft — id: 0 is a
// synthetic placeholder, never written anywhere. getReportDataScope's
// report_definition_team_rights lookup for id 0 will find nothing, but
// the resolved test tenant's own login IS that company's owner
// (confirmed: the same signup flow that provisions WEBSITE_LEAD_HANDLE_
// DB_NAME's tenant_masters row also creates it with company_flag: 1),
// so isCompanyOwner's bypass covers it — no special-casing needed here.
// Capped to 20 rows (a preview, not a real run) and never written to
// report_runs (this isn't a tracked run against a real report).
export const testRunReportDefinition = async (req) => {
  try {
    const { type = "query", model_key, plugin_key, columns_json, filters_json, group_by_json } = req.body || {};
    if (!columns_json) {
      return resError({ developer_msg: "columns_json is required" });
    }

    let page_id;
    if (type === "plugin") {
      const plugin = getRegisteredPlugin(plugin_key);
      if (!plugin) {
        return resError({ ack_msg: "Unknown report source", developer_msg: `plugin_key "${plugin_key}" is not registered` });
      }
      page_id = plugin.page_id;
    } else if (type === "composite") {
      page_id = PAGE_ID.REPORT_BUILDER;
    } else {
      if (!getRegisteredModel(model_key)) {
        return resError({ ack_msg: "Unknown report source", developer_msg: `model_key "${model_key}" is not whitelisted` });
      }
      page_id = PAGE_ID.REPORT_BUILDER;
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

    const definition = {
      id: 0,
      type,
      model_key: type === "plugin" ? null : model_key,
      plugin_key: type === "plugin" ? plugin_key : null,
      columns_json: asJsonString(columns_json),
      filters_json: filters_json ? asJsonString(filters_json) : null,
      group_by_json: group_by_json ? asJsonString(group_by_json) : null,
      page_id,
      company_masters_id: tenantDBFind.company_masters_id,
    };
    const testReq = {
      ...req,
      tenantDB,
      body: { a_application_login_id: tenantDBFind.a_application_login_id, limit: 20, offset: 0 },
    };

    return runDefinitionByType(definition, testReq);
  } catch (e) {
    console.error("testRunReportDefinition error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Step 10 — Report groups. Tenant-defined organization for their own
// report_definitions (e.g. "CRM", "HRMS") — distinct from Step 1's
// admin-fixed system-gallery `category`. Flat, single-level, same
// build-tier owner+PIN gate as everything else that configures reports.
export const listReportGroups = async (req) => {
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return resError({ developer_msg: "a_application_login_id is required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportGroup = reportGroupModel(req.tenantDB);
    const rows = await ReportGroup.findAll({
      where: { company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });
    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("listReportGroups error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const createReportGroup = async (req) => {
  try {
    const { a_application_login_id, group_name, display_order } = req.body || {};
    if (!a_application_login_id || !group_name || !group_name.trim()) {
      return resError({ developer_msg: "a_application_login_id and group_name are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportGroup = reportGroupModel(req.tenantDB);
    const created = await ReportGroup.create({
      company_masters_id: findCompanyId.company_masters_id,
      group_name: group_name.trim(),
      display_order: display_order || 0,
      created_date_time: now(),
    });
    return resSuccess({ data: { item: created }, ack_msg: "Report group created successfully" });
  } catch (e) {
    console.error("createReportGroup error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const updateReportGroup = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id, group_name, display_order } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportGroup = reportGroupModel(req.tenantDB);
    const group = await ReportGroup.findOne({
      where: { id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!group) {
      return resError({ code: 404, ack_msg: "Report group not found", developer_msg: "No matching report group for this company" });
    }
    const patch = {};
    if (group_name !== undefined && group_name.trim()) patch.group_name = group_name.trim();
    if (display_order !== undefined) patch.display_order = display_order;
    await group.update(patch);
    return resSuccess({ data: { item: group }, ack_msg: "Report group updated successfully" });
  } catch (e) {
    console.error("updateReportGroup error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Deleting a group doesn't cascade-delete or block on its reports — they
// simply fall back to "Ungrouped" (report_group_id is a soft reference,
// no FK constraint to violate), same as a report whose group was never
// set in the first place.
export const deleteReportGroup = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportGroup = reportGroupModel(req.tenantDB);
    const group = await ReportGroup.findOne({
      where: { id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!group) {
      return resError({ code: 404, ack_msg: "Report group not found", developer_msg: "No matching report group for this company" });
    }
    await group.update({ isDelete: 1 });
    return resSuccess({ ack_msg: "Report group deleted successfully" });
  } catch (e) {
    console.error("deleteReportGroup error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const createReportDefinition = async (req) => {
  try {
    const { a_application_login_id, name, type = "query", model_key, plugin_key, columns_json, filters_json, group_by_json, source_system_report_definition_id, filters_to_show, report_group_id, description } = req.body || {};
    if (!a_application_login_id || !name || !columns_json) {
      return resError({ developer_msg: "a_application_login_id, name and columns_json are required" });
    }

    let page_id;
    if (type === "plugin") {
      const plugin = getRegisteredPlugin(plugin_key);
      if (!plugin) {
        return resError({ ack_msg: "Unknown report source", developer_msg: `plugin_key "${plugin_key}" is not registered` });
      }
      // Reuses that plugin's OWN existing page_id (its real, already-live
      // rights) — never invented fresh, matches the original doc's rule
      // that wrapping a plugin doesn't change its rights.
      page_id = plugin.page_id;
    } else if (type === "composite") {
      // columns_json holds the metric KEYS array for this type — same
      // "shape varies by type" precedent filters_json already has between
      // query-type ([{column,op,value}]) and plugin-type ({paramKey:value}).
      // Also accepts {compute}/{case} derived-column entries mixed in
      // (validated properly, with real field-reference checks, at RUN time
      // in compositeEngine.js — this is just a lightweight create-time
      // sanity check, same depth queryEngine.js's own create-time check has).
      let rawEntries;
      try {
        rawEntries = typeof columns_json === "string" ? JSON.parse(columns_json) : columns_json;
      } catch {
        return resError({ developer_msg: "columns_json must be a JSON array of metric keys for composite reports" });
      }
      if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
        return resError({ developer_msg: "At least one metric is required" });
      }
      const metricKeys = rawEntries.filter((e) => typeof e === "string");
      if (metricKeys.length === 0) {
        return resError({ developer_msg: "At least one metric is required" });
      }
      const unknown = metricKeys.find((k) => !getRegisteredMetric(k));
      if (unknown) {
        return resError({ ack_msg: "Unknown metric", developer_msg: `metric "${unknown}" is not whitelisted` });
      }
      const invalidDerived = rawEntries.find((e) => typeof e !== "string" && !e.compute && !e.case);
      if (invalidDerived) {
        return resError({ developer_msg: "Each columns_json entry must be a metric key string, or a {compute} / {case} derived column" });
      }
      // No existing page fits "an arbitrary set of per-member metrics" —
      // shares Report Builder's own page/rights, same as query-type.
      page_id = PAGE_ID.REPORT_BUILDER;
    } else {
      if (!getRegisteredModel(model_key)) {
        return resError({ ack_msg: "Unknown report source", developer_msg: `model_key "${model_key}" is not whitelisted` });
      }
      // No existing page makes sense to reuse for an arbitrary ad-hoc query
      // yet (modelRegistry.js only covers "products" so far) — every
      // query-type definition shares Report Builder's own page/rights
      // until that changes.
      page_id = PAGE_ID.REPORT_BUILDER;
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    req.body.company_masters_id = findCompanyId.company_masters_id; // for logAuditEvent below

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const created = await ReportDefinition.create({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      name,
      type,
      page_id,
      model_key: type === "plugin" ? null : model_key,
      plugin_key: type === "plugin" ? plugin_key : null,
      columns_json: asJsonString(columns_json),
      filters_json: filters_json ? asJsonString(filters_json) : null,
      group_by_json: group_by_json ? asJsonString(group_by_json) : null,
      source_system_report_definition_id: source_system_report_definition_id || null,
      filters_to_show: filters_to_show ? asJsonString(filters_to_show) : null,
      report_group_id: report_group_id || null,
      description: description || null,
      created_date_time: now(),
    });

    // copyFromSystemReportDefinition logs its own "copy_from_gallery" audit
    // event separately (with the gallery source id in details) — skip the
    // generic "create" event here for that path so a gallery copy isn't
    // logged twice under two different actions.
    if (!source_system_report_definition_id) {
      await logAuditEvent(req, {
        module_key: "report_builder",
        action: "create",
        entity_type: "report_definition",
        entity_id: created.id,
        details: { name, type },
      });
    }

    return resSuccess({ data: { item: created }, ack_msg: "Report definition created successfully" });
  } catch (e) {
    console.error("createReportDefinition error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const updateReportDefinition = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id, name, columns_json, filters_json, group_by_json, filters_to_show, report_group_id, description } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    req.body.company_masters_id = findCompanyId.company_masters_id; // for logAuditEvent below

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    // IDOR guard — id must belong to the resolved company, never trusted alone.
    const definition = await ReportDefinition.findOne({
      where: { id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    const patch = { modified_date: now() };
    if (name !== undefined) patch.name = name;
    if (columns_json !== undefined) patch.columns_json = asJsonString(columns_json);
    if (filters_json !== undefined) patch.filters_json = filters_json ? asJsonString(filters_json) : null;
    if (group_by_json !== undefined) patch.group_by_json = group_by_json ? asJsonString(group_by_json) : null;
    if (filters_to_show !== undefined) patch.filters_to_show = filters_to_show ? asJsonString(filters_to_show) : null;
    if (report_group_id !== undefined) patch.report_group_id = report_group_id || null;
    if (description !== undefined) patch.description = description || null;

    await definition.update(patch);

    await logAuditEvent(req, {
      module_key: "report_builder",
      action: "update",
      entity_type: "report_definition",
      entity_id: definition.id,
      details: { name: definition.name },
    });

    return resSuccess({ data: { item: definition }, ack_msg: "Report definition updated successfully" });
  } catch (e) {
    console.error("updateReportDefinition error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteReportDefinition = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    req.body.company_masters_id = findCompanyId.company_masters_id; // for logAuditEvent below

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definition = await ReportDefinition.findOne({
      where: { id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    // No "blocked if referenced" check — dashboard_widgets/report_schedules
    // (the tables that would reference a definition) don't exist until
    // Phase 4/6, so there's nothing to check against yet.
    await definition.update({ isDelete: 1, modified_date: now() });

    await logAuditEvent(req, {
      module_key: "report_builder",
      action: "delete",
      entity_type: "report_definition",
      entity_id: definition.id,
      details: { name: definition.name },
    });

    return resSuccess({ ack_msg: "Report definition deleted successfully" });
  } catch (e) {
    console.error("deleteReportDefinition error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const listReportDefinitions = async (req) => {
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return resError({ developer_msg: "a_application_login_id is required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const rows = await ReportDefinition.findAll({
      where: { company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
      order: [["id", "DESC"]],
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("listReportDefinitions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Discovery for a non-owner — "Custom Reports" (ReportsTileView's dynamic
// section) calls this instead of listReportDefinitions, which stays
// owner+PIN only. Visibility is per-definition_team_rights ONLY (Step 7's
// simplified design — no page-level a_application_login_type_rights
// fallback at all): a login sees exactly the reports it has an explicit,
// non-deleted grant row for. The owner still sees everything, same bypass
// every other gate in this file has.
export const listRunnableReportDefinitions = async (req) => {
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return resError({ developer_msg: "a_application_login_id is required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const company_masters_id = findCompanyId.company_masters_id;

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    // Build-internal fields (columns_json/filters_json/group_by_json) stay
    // private to the owner+PIN listReportDefinitions — this is a trimmed,
    // run-only shape.
    // group_by_json is fetched only to derive is_aggregated below, then
    // stripped back out — the raw column list itself stays build-internal
    // (owner+PIN listReportDefinitions only), same boundary the comment
    // above already draws for columns_json/filters_json.
    // No "category" here — that column only ever existed on the master-DB
    // system gallery (system_report_definitions); a tenant's own reports
    // are organized via report_group_id instead (Step 10). Was
    // incorrectly requested here for a real tenant column that was never
    // migrated onto this table, surfacing as "Unknown column 'category'"
    // the first time a real tenant hit this endpoint — see the
    // add-description-to-report-definitions migration's own comment.
    const attributes = ["id", "name", "type", "description", "page_id", "model_key", "plugin_key", "filters_to_show", "group_by_json", "report_group_id", "created_date_time"];
    // Step 9's Compare Period is only offered for aggregated results
    // (composite is always per-team-member aggregates; a query-type report
    // is aggregated iff it has a non-empty group_by_json) — comparing a
    // raw ungrouped row listing period-over-period has no clean meaning.
    const toRunnableShape = (row) => {
      const plain = row.get({ plain: true });
      // group_by_columns: just the column-key list (Step 9's Drill Down —
      // needed to merge a clicked group row's own values into filters,
      // see runQueryReport's suppressGroupBy), not the raw group_by_json —
      // no aggregate/having internals ride along, only base column names,
      // and only for query-type (Drill Down v1 scope per the plan;
      // composite has no defined meaning for it, dimensioned by team
      // member, not a grouped column).
      let is_aggregated = plain.type === "composite";
      let group_by_columns = [];
      if (plain.type === "query") {
        try {
          const groupBy = JSON.parse(plain.group_by_json || "[]");
          group_by_columns = Array.isArray(groupBy) ? groupBy : [];
          is_aggregated = group_by_columns.length > 0;
        } catch {
          is_aggregated = false;
        }
      }
      delete plain.group_by_json;
      return { ...plain, is_aggregated, group_by_columns };
    };

    const owner = await isCompanyOwner(a_application_login_id, company_masters_id);
    if (owner) {
      const rows = await ReportDefinition.findAll({
        where: { company_masters_id, isDelete: 0 },
        attributes,
        order: [["id", "DESC"]],
      });
      return resSuccess({ data: { item: rows.map(toRunnableShape) } });
    }

    const RightsModel = reportDefinitionTeamRightModel(req.tenantDB);
    const grants = await RightsModel.findAll({
      where: { a_application_login_id, company_masters_id, isDelete: 0 },
      attributes: ["report_definition_id"],
      raw: true,
    });
    const grantedIds = grants.map((g) => g.report_definition_id);
    if (grantedIds.length === 0) {
      return resSuccess({ data: { item: [] } });
    }

    const rows = await ReportDefinition.findAll({
      where: { id: { [Op.in]: grantedIds }, company_masters_id, isDelete: 0 },
      attributes,
      order: [["id", "DESC"]],
    });
    return resSuccess({ data: { item: rows.map(toRunnableShape) } });
  } catch (e) {
    console.error("listRunnableReportDefinitions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Step 2's CheckBoxFilterModal integration — the run screen (any granted
// non-owner, not just the build-tier owner) needs a table's generalFilters
// slot map + target-column types to compute filtersToShow and pick
// findInSet vs in (generalFilterAdapter.ts). getModelRegistry stays
// PIN-gated (full build surface); this is the deliberately narrow,
// no-PIN slice of it — same run-tier as list-runnable/run itself, no
// separate access check needed since model_key alone reveals nothing a
// runnable report's own response doesn't already.
export const getGeneralFilterConfig = async (req) => {
  try {
    const { model_key } = req.body || {};
    if (!model_key) {
      return resError({ developer_msg: "model_key is required" });
    }
    const meta = getGeneralFilterMeta(model_key);
    if (!meta) {
      return resError({ ack_msg: "Unknown model_key", developer_msg: `No registry entry for model_key ${model_key}` });
    }
    return resSuccess({ data: meta });
  } catch (e) {
    console.error("getGeneralFilterConfig error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Manage Access modal's initial load — current grants for one report,
// build-tier gated the same as the save below (build internals, not for
// the run-only surface).
export const getReportTeamRights = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const company_masters_id = findCompanyId.company_masters_id;

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definition = await ReportDefinition.findOne({
      where: { id, company_masters_id, isDelete: 0 },
    });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    const RightsModel = reportDefinitionTeamRightModel(req.tenantDB);
    const rows = await RightsModel.findAll({
      where: { report_definition_id: definition.id, company_masters_id, isDelete: 0 },
      attributes: ["a_application_login_id", "data_scope"],
      raw: true,
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("getReportTeamRights error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Manage Access modal's save (build-tier, owner+PIN gated at the route
// layer, same as create/update/delete).
export const saveReportTeamRights = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id, grants, removals } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const company_masters_id = findCompanyId.company_masters_id;

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definition = await ReportDefinition.findOne({
      where: { id, company_masters_id, isDelete: 0 },
    });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    await setReportTeamRights(
      { report_definition_id: definition.id, company_masters_id, grants: Array.isArray(grants) ? grants : [], removals: Array.isArray(removals) ? removals : [] },
      req.tenantDB,
    );

    await logAuditEvent(req, {
      module_key: "report_builder",
      action: "update_team_rights",
      entity_type: "report_definition",
      entity_id: definition.id,
      details: { grants, removals },
    });

    return resSuccess({ ack_msg: "Access updated successfully" });
  } catch (e) {
    console.error("saveReportTeamRights error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Run History (small addition — report_runs already gets a row written by
// runReportDefinition/runBatchReportDefinitions on every run; nothing read
// it back until now). Build-tier gated the same as Manage Access — a
// report's run log is a build/debugging surface, not something a
// run-tier viewer needs. Paginated the same limit/offset convention every
// other list here uses; executed_by comes back as a raw login id, resolved
// to a display name client-side off the same team-member list Manage
// Access already fetches (fetchCompanyTeamApi) rather than joining here.
export const listReportRuns = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id, limit = 50, offset = 0 } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const company_masters_id = findCompanyId.company_masters_id;

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definition = await ReportDefinition.findOne({
      where: { id, company_masters_id, isDelete: 0 },
    });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    const ReportRun = reportRunModel(req.tenantDB);
    const rows = await ReportRun.findAll({
      where: { report_definition_id: definition.id, company_masters_id },
      order: [["executed_at", "DESC"]],
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("listReportRuns error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Shared by runReportDefinition (single) and runBatchReportDefinitions —
// dispatches by definition.type. Plugin dispatch is pass-through only: the
// wrapped service's own rights behavior (or lack of it, see
// pluginRegistry.js's hasOwnRightsCheck notes) runs completely unchanged,
// nothing here adds or removes rights filtering on top of it. Reshapes
// whichever shape the plugin returns (dataKey "item" or "items") into the
// same {rows, row_count, duration_ms} envelope runQueryReport already
// returns, so callers (including the frontend's results grid) don't need
// to know which type of definition they ran.
export const runDefinitionByType = async (definition, req, res) => {
  const startedAt = Date.now();
  if (definition.type === "plugin") {
    const plugin = getRegisteredPlugin(definition.plugin_key);
    if (!plugin) {
      return resError({ ack_msg: "Unknown report source", developer_msg: `plugin_key "${definition.plugin_key}" is not registered` });
    }

    // query-type/composite-type both fail closed on this same check
    // INSIDE their own engines (runQueryReport/runCompositeReport) — but
    // plugin dispatch is pass-through by design (each wrapped service's
    // own rights behavior runs unchanged, see the comment above this
    // function), and at least one registered plugin
    // (productInventoryReport) has none at all (hasOwnRightsCheck: false
    // in pluginRegistry.js). Without this, any login satisfying just the
    // company feature flag — no report_definition_team_rights grant
    // needed — could run/export a plugin-type report_definition by
    // guessing its numeric id. Checked here, not query/composite's own
    // engines, purely to avoid a redundant DB round trip where the same
    // check already fail-closes.
    const { a_application_login_id } = req.body || {};
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const { scope } = await getReportDataScope({
      report_definition_id: definition.id,
      a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      tenantDB: req.tenantDB,
    });
    if (!scope) {
      return resError({ ack_msg: "No access to this report", developer_msg: "No report_definition_team_rights grant for this login on this report" });
    }
    // filters_json for a plugin-type definition is a plain object keyed to
    // THAT plugin's own bespoke param names (e.g. selected_dates,
    // selectedSourceTypes for sourceReport) — not the generic
    // {column,op,value}[] shape query-type filters use. Merged as defaults
    // under whatever the actual request body already has, so a caller can
    // still override a specific param at run time without re-saving.
    const savedFilters = definition.filters_json ? JSON.parse(definition.filters_json) : {};
    const pluginReq = { ...req, body: { ...savedFilters, ...req.body } };
    const result = await plugin.fn(pluginReq, res);
    if (result?.ack !== 1) return result;
    const rows = result?.data?.[plugin.dataKey] ?? [];
    return resSuccess({
      data: { rows, row_count: Array.isArray(rows) ? rows.length : 0, duration_ms: Date.now() - startedAt },
      ack_msg: result?.ack_msg,
    });
  }
  if (definition.type === "composite") {
    return runCompositeReport(definition, req);
  }
  return runQueryReport(definition, req);
};

// reportExportRegistry.js's `fetchPage` for the single "report_builder"
// reportType every Report Builder export shares (item 7 of the plan —
// one generic entry serving all report_definitions, not one per report the
// way the ~46 hand-coded legacy reports need). genericReportExportService's
// fetchAllRows sets `ul`/`ll` on req.body before each call; translated here
// into the limit/offset runDefinitionByType's engines already expect.
// The specific report_definition_id rides in req.body.report_definition_id
// (part of ExportExcelMenuItem's `filters` prop, a generic passthrough —
// never the registry key itself, which stays a static string).
export const fetchReportBuilderExportPage = async (req) => {
  const { report_definition_id, a_application_login_id, ul, ll } = req.body || {};
  if (!report_definition_id || !a_application_login_id) {
    return resError({ developer_msg: "report_definition_id and a_application_login_id are required" });
  }

  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId) {
    return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
  }

  // /reports/export-excel is a shared, reportType-agnostic route (see
  // genericReportExportRouter.js) with no per-feature gating of its own —
  // every OTHER reportType in this registry has no company feature flag
  // to check, so nothing gates them here. report_builder is the one
  // exception: every other entry point into it (create/list/run/...) goes
  // through requireReportBuilderFlag at the route layer, and this is the
  // one reachable path that doesn't, so it has to check for itself.
  const enabled = await isFeatureEnabled(findCompanyId.company_masters_id, "report_builder");
  if (!enabled) {
    return resError({ ack_msg: "Report Builder is not enabled for this company", developer_msg: "company_feature_flags.report_builder is not set" });
  }

  const ReportDefinition = reportDefinitionModel(req.tenantDB);
  const definition = await ReportDefinition.findOne({
    where: { id: report_definition_id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
  });
  if (!definition) {
    return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
  }

  const pageReq = { ...req, body: { ...req.body, limit: ll, offset: ul } };
  return runDefinitionByType(definition, pageReq);
};

export const runReportDefinition = async (req, res) => {
  const startedAt = Date.now();
  try {
    const { id } = req.params || {};
    const { a_application_login_id } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param) and a_application_login_id are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    // IDOR guard — id must belong to the resolved company, never trusted alone.
    const definition = await ReportDefinition.findOne({
      where: { id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    const result = await runDefinitionByType(definition, req, res);

    const ReportRun = reportRunModel(req.tenantDB);
    await ReportRun.create({
      company_masters_id: findCompanyId.company_masters_id,
      report_definition_id: definition.id,
      executed_by: a_application_login_id,
      executed_at: now(),
      filters_snapshot_json: definition.filters_json,
      row_count: result?.data?.row_count ?? null,
      duration_ms: Date.now() - startedAt,
      success: result?.ack === 1 ? 1 : 0,
      error_message: result?.ack === 1 ? null : String(result?.developer_msg || "").slice(0, 500),
    });

    return result;
  } catch (e) {
    console.error("runReportDefinition error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Sequential for...of + await — NOT Promise.all. A dashboard-style multi-
// widget load firing this fans concurrent connections into one tenant DB
// pool; every existing *CroneTabRunner in this codebase uses the same
// sequential-loop guard for the same reason. One bad id fails just that
// item, not the whole batch.
export const runBatchReportDefinitions = async (req, res) => {
  try {
    const { a_application_login_id, items } = req.body || {};
    if (!a_application_login_id || !Array.isArray(items) || items.length === 0) {
      return resError({ developer_msg: "a_application_login_id and a non-empty items array are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const ReportRun = reportRunModel(req.tenantDB);
    const results = [];

    for (const item of items) {
      const startedAt = Date.now();
      const definition = await ReportDefinition.findOne({
        where: { id: item.report_definition_id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
      });
      if (!definition) {
        results.push({ report_definition_id: item.report_definition_id, ...resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" }) });
        continue;
      }

      const runReq = { ...req, body: { ...req.body, ...item.filters, a_application_login_id } };
      const result = await runDefinitionByType(definition, runReq, res);

      await ReportRun.create({
        company_masters_id: findCompanyId.company_masters_id,
        report_definition_id: definition.id,
        executed_by: a_application_login_id,
        executed_at: now(),
        filters_snapshot_json: definition.filters_json,
        row_count: result?.data?.row_count ?? null,
        duration_ms: Date.now() - startedAt,
        success: result?.ack === 1 ? 1 : 0,
        error_message: result?.ack === 1 ? null : String(result?.developer_msg || "").slice(0, 500),
      });

      results.push({ report_definition_id: definition.id, ...result });
    }

    return resSuccess({ data: { results } });
  } catch (e) {
    console.error("runBatchReportDefinitions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
