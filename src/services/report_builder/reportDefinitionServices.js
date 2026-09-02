import moment from "moment";
import { reportDefinitionModel } from "../../models/report_builder/reportDefinitionModel.js";
import { reportRunModel } from "../../models/report_builder/reportRunModel.js";
import systemReportDefinitionModel from "../../models/report_builder/systemReportDefinitionModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { logAuditEvent } from "../company_setup/auditLogServices.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { runCompositeReport } from "./compositeEngine.js";
import { getRegisteredMetric, listMetricsRegistry } from "./metricsRegistry.js";
import { getRegisteredModel, listModelRegistry } from "./modelRegistry.js";
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

export const createReportDefinition = async (req) => {
  try {
    const { a_application_login_id, name, type = "query", model_key, plugin_key, columns_json, filters_json, group_by_json, source_system_report_definition_id } = req.body || {};
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
    const { a_application_login_id, name, columns_json, filters_json, group_by_json } = req.body || {};
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
