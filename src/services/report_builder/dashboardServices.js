// Dashboard Feature — Phase 2. A dashboard arranges widgets, each backed by
// an EXISTING report_definitions row (dashboard_widgets.report_definition_id)
// reusing its query/composite/plugin engine as-is — no new SQL engine here,
// see dashboardWidgetServices.js for widget CRUD and runDashboard() below
// for the run path.
import moment from "moment";
import { dashboardModel } from "../../models/report_builder/dashboardModel.js";
import { dashboardWidgetModel } from "../../models/report_builder/dashboardWidgetModel.js";
import { reportDefinitionModel } from "../../models/report_builder/reportDefinitionModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCached, setCached } from "../../utils/simpleCache.js";
import { logAuditEvent } from "../company_setup/auditLogServices.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { runDefinitionByType } from "./reportDefinitionServices.js";

const now = () => moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

// Result cache is keyed off the DEFINITION a widget reuses, not the widget
// itself — multiple widgets/dashboards pointing at the same
// report_definition_id share one cached run. 45s: short enough that a
// report edited elsewhere shows up on the next dashboard view soon, long
// enough that opening the same dashboard repeatedly (or several people
// opening it around the same time) doesn't re-run every widget's query
// every single time.
const DASHBOARD_WIDGET_CACHE_TTL_MS = 45000;
// A dashboard widget almost always wants an aggregate/summary, not raw
// rows — queryEngine.js's own HARD_ROW_LIMIT (5000)/15s timeout are sized
// for "one report a human explicitly ran", not "N widgets on every
// dashboard view". req.body.limit already flows straight into that clamp
// (queryEngine.js's own `Math.min(Math.max(requestedLimit, 1),
// HARD_ROW_LIMIT)`) — no queryEngine.js change needed, just override it
// here before calling runDefinitionByType.
const DASHBOARD_WIDGET_ROW_LIMIT = 500;

async function loadOwnedDashboard(req) {
  const { id } = req.params || {};
  const { a_application_login_id } = req.body || {};
  if (!id || !a_application_login_id) {
    return { error: resError({ developer_msg: "id (param) and a_application_login_id are required" }) };
  }
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId) {
    return { error: resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" }) };
  }
  const company_masters_id = findCompanyId.company_masters_id;
  const Dashboard = dashboardModel(req.tenantDB);
  const dashboard = await Dashboard.findOne({ where: { id, company_masters_id, isDelete: 0 } });
  if (!dashboard) {
    return { error: resError({ code: 404, ack_msg: "Dashboard not found", developer_msg: "No matching dashboard for this company" }) };
  }
  return { dashboard, company_masters_id };
}

export const createDashboard = async (req) => {
  try {
    const { a_application_login_id, name, description, icon } = req.body || {};
    if (!a_application_login_id || !name) {
      return resError({ developer_msg: "a_application_login_id and name are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    req.body.company_masters_id = findCompanyId.company_masters_id; // for logAuditEvent below

    const Dashboard = dashboardModel(req.tenantDB);
    // First dashboard for this company becomes the default automatically —
    // same "first row created wins" convention createDocumentTemplate uses.
    const existingCount = await Dashboard.count({ where: { company_masters_id: findCompanyId.company_masters_id, isDelete: 0 } });

    const created = await Dashboard.create({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      name,
      description: description || null,
      icon: icon || null,
      is_default: existingCount === 0 ? 1 : 0,
      display_order: existingCount,
      created_date_time: now(),
    });

    await logAuditEvent(req, {
      module_key: "dashboard_builder",
      action: "create",
      entity_type: "dashboard",
      entity_id: created.id,
      details: { name },
    });

    return resSuccess({ data: { item: created }, ack_msg: "Dashboard created successfully" });
  } catch (e) {
    console.error("createDashboard error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const updateDashboard = async (req) => {
  try {
    const { dashboard, error } = await loadOwnedDashboard(req);
    if (error) return error;
    const { name, description, icon } = req.body || {};

    const patch = { modified_date: now() };
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description || null;
    if (icon !== undefined) patch.icon = icon || null;

    await dashboard.update(patch);

    await logAuditEvent(req, {
      module_key: "dashboard_builder",
      action: "update",
      entity_type: "dashboard",
      entity_id: dashboard.id,
      details: { name: dashboard.name },
    });

    return resSuccess({ data: { item: dashboard }, ack_msg: "Dashboard updated successfully" });
  } catch (e) {
    console.error("updateDashboard error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteDashboard = async (req) => {
  try {
    const { dashboard, company_masters_id, error } = await loadOwnedDashboard(req);
    if (error) return error;

    const Dashboard = dashboardModel(req.tenantDB);
    const remaining = await Dashboard.count({ where: { company_masters_id, isDelete: 0 } });
    if (remaining <= 1) {
      return resError({ developer_msg: "Cannot delete the last remaining dashboard" });
    }

    // App-enforced cascade (no DB-level FK on dashboard_widgets.dashboard_id,
    // same convention as every other report_builder table) — soft-delete
    // this dashboard's own widgets too, or they'd sit orphaned but not
    // visibly deleted.
    const Widget = dashboardWidgetModel(req.tenantDB);
    await Widget.update(
      { isDelete: 1, modified_date: now() },
      { where: { dashboard_id: dashboard.id, isDelete: 0 } },
    );

    await dashboard.update({ isDelete: 1, modified_date: now() });

    if (dashboard.is_default) {
      const nextDefault = await Dashboard.findOne({ where: { company_masters_id, isDelete: 0 }, order: [["display_order", "ASC"], ["id", "ASC"]] });
      if (nextDefault) await nextDefault.update({ is_default: 1 });
    }

    await logAuditEvent(req, {
      module_key: "dashboard_builder",
      action: "delete",
      entity_type: "dashboard",
      entity_id: dashboard.id,
      details: { name: dashboard.name },
    });

    return resSuccess({ ack_msg: "Dashboard deleted successfully" });
  } catch (e) {
    console.error("deleteDashboard error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const listDashboards = async (req) => {
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return resError({ developer_msg: "a_application_login_id is required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }

    const Dashboard = dashboardModel(req.tenantDB);
    const rows = await Dashboard.findAll({
      where: { company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("listDashboards error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getDashboard = async (req) => {
  try {
    const { dashboard, error } = await loadOwnedDashboard(req);
    if (error) return error;

    const Widget = dashboardWidgetModel(req.tenantDB);
    const widgets = await Widget.findAll({
      where: { dashboard_id: dashboard.id, isDelete: 0 },
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });

    // Batched second query, not a join — same convention modelRegistry.js's
    // relation resolution already uses (resolve ids, merge in JS).
    const definitionIds = [...new Set(widgets.map((w) => w.report_definition_id))];
    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definitions = definitionIds.length
      ? await ReportDefinition.findAll({
          where: { id: definitionIds },
          attributes: ["id", "name", "type", "isDelete"],
        })
      : [];
    const definitionById = new Map(definitions.map((d) => [d.id, d]));

    const widgetsWithSource = widgets.map((w) => {
      const source = definitionById.get(w.report_definition_id);
      return {
        ...w.toJSON(),
        report_definition_name: source?.isDelete === 0 ? source.name : null,
        report_definition_type: source?.isDelete === 0 ? source.type : null,
        source_missing: !source || source.isDelete !== 0,
      };
    });

    return resSuccess({ data: { item: { ...dashboard.toJSON(), widgets: widgetsWithSource } } });
  } catch (e) {
    console.error("getDashboard error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const reorderDashboards = async (req) => {
  try {
    const { a_application_login_id, orderedIds } = req.body || {};
    if (!a_application_login_id || !Array.isArray(orderedIds)) {
      return resError({ developer_msg: "a_application_login_id and orderedIds are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }

    const Dashboard = dashboardModel(req.tenantDB);
    await Promise.all(
      orderedIds.map((id, index) =>
        Dashboard.update(
          { display_order: index },
          { where: { id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 } },
        ),
      ),
    );

    return resSuccess({ ack_msg: "Reordered successfully" });
  } catch (e) {
    console.error("reorderDashboards error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const setDefaultDashboard = async (req) => {
  try {
    const { dashboard, company_masters_id, error } = await loadOwnedDashboard(req);
    if (error) return error;

    const Dashboard = dashboardModel(req.tenantDB);
    await Dashboard.update({ is_default: 0 }, { where: { company_masters_id, isDelete: 0 } });
    await dashboard.update({ is_default: 1 });

    return resSuccess({ ack_msg: "Default dashboard updated" });
  } catch (e) {
    console.error("setDefaultDashboard error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const duplicateDashboard = async (req) => {
  try {
    const { dashboard, company_masters_id, error } = await loadOwnedDashboard(req);
    if (error) return error;
    const { a_application_login_id } = req.body || {};

    const Dashboard = dashboardModel(req.tenantDB);
    const Widget = dashboardWidgetModel(req.tenantDB);

    const existingCount = await Dashboard.count({ where: { company_masters_id, isDelete: 0 } });
    const created = await Dashboard.create({
      company_masters_id,
      a_application_login_id,
      name: `${dashboard.name} (Copy)`,
      description: dashboard.description,
      icon: dashboard.icon,
      is_default: 0,
      display_order: existingCount,
      created_date_time: now(),
    });

    // Copies pointers to the SAME report_definition_id rows — a duplicate
    // dashboard doesn't fork the underlying reports too, same as
    // duplicateDocumentTemplate only copying the template row, not
    // whatever data it prints.
    const sourceWidgets = await Widget.findAll({ where: { dashboard_id: dashboard.id, isDelete: 0 } });
    for (const w of sourceWidgets) {
      await Widget.create({
        dashboard_id: created.id,
        report_definition_id: w.report_definition_id,
        widget_type: w.widget_type,
        title: w.title,
        chart_config_json: w.chart_config_json,
        position_x: w.position_x,
        position_y: w.position_y,
        width: w.width,
        height: w.height,
        display_order: w.display_order,
        created_date_time: now(),
      });
    }

    await logAuditEvent(req, {
      module_key: "dashboard_builder",
      action: "duplicate",
      entity_type: "dashboard",
      entity_id: created.id,
      details: { source_id: dashboard.id },
    });

    return resSuccess({ data: { item: created }, ack_msg: "Dashboard duplicated successfully" });
  } catch (e) {
    console.error("duplicateDashboard error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Runs every active widget's underlying report_definition and returns them
// together. Sequential — NOT Promise.all/bounded-parallel — same guard
// runBatchReportDefinitions itself uses ("fans concurrent connections into
// one tenant DB pool... every existing *CroneTabRunner... uses the same
// sequential-loop guard for the same reason"). The cache below is what
// actually keeps repeat dashboard views fast, not concurrency.
export const runDashboard = async (req, res) => {
  try {
    const { dashboard, company_masters_id, error } = await loadOwnedDashboard(req);
    if (error) return error;

    const Widget = dashboardWidgetModel(req.tenantDB);
    const widgets = await Widget.findAll({
      where: { dashboard_id: dashboard.id, isDelete: 0, isActive: 1 },
      order: [["display_order", "ASC"], ["id", "ASC"]],
    });
    if (widgets.length === 0) {
      return resSuccess({ data: { item: { ...dashboard.toJSON(), widgets: [] } } });
    }

    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definitionIds = [...new Set(widgets.map((w) => w.report_definition_id))];
    const definitions = await ReportDefinition.findAll({
      where: { id: definitionIds, company_masters_id, isDelete: 0 },
    });
    const definitionById = new Map(definitions.map((d) => [d.id, d]));

    const results = [];
    for (const widget of widgets) {
      const definition = definitionById.get(widget.report_definition_id);
      const base = {
        widget_id: widget.id,
        widget_type: widget.widget_type,
        title: widget.title,
        chart_config_json: widget.chart_config_json,
        position_x: widget.position_x,
        position_y: widget.position_y,
        width: widget.width,
        height: widget.height,
      };

      if (!definition) {
        results.push({ ...base, ...resError({ ack_msg: "Source report not found", developer_msg: `report_definition_id ${widget.report_definition_id} is missing or deleted` }) });
        continue;
      }

      const cacheKey = `dashboard_widget:${company_masters_id}:${definition.id}`;
      let result = getCached(cacheKey);
      if (!result) {
        const runReq = { ...req, body: { ...req.body, limit: DASHBOARD_WIDGET_ROW_LIMIT, offset: 0, filters: undefined } };
        result = await runDefinitionByType(definition, runReq, res);
        if (result?.ack === 1) setCached(cacheKey, result, DASHBOARD_WIDGET_CACHE_TTL_MS);
      }

      results.push({ ...base, ...result });
    }

    return resSuccess({ data: { item: { ...dashboard.toJSON(), widgets: results } } });
  } catch (e) {
    console.error("runDashboard error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
