// Dashboard Feature — Phase 2. Widget CRUD. A widget has no SQL engine of
// its own (see dashboardServices.js's header comment) — report_definition_id
// just points at an existing report_definitions row.
import moment from "moment";
import { dashboardModel } from "../../models/report_builder/dashboardModel.js";
import { dashboardWidgetModel } from "../../models/report_builder/dashboardWidgetModel.js";
import { reportDefinitionModel } from "../../models/report_builder/reportDefinitionModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { logAuditEvent } from "../company_setup/auditLogServices.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resolveDashboardRights } from "./dashboardRights.js";
import { getRegisteredModel } from "./modelRegistry.js";

const now = () => moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
const asJsonString = (value) => (typeof value === "string" ? value : JSON.stringify(value));
const humanize = (key) =>
  String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Bounds the worst case per dashboard view — runDashboard() runs one report
// per widget, sequentially (see dashboardServices.js).
const MAX_WIDGETS_PER_DASHBOARD = 20;

// Same whitelist queryEngine.js's own ALLOWED_AGGREGATES enforces — kept in
// sync by hand (that one lives in queryEngine.js proper since it also maps
// to the real SQL function name; this one only needs to validate the op is
// legal before saving it into columns_json, queryEngine.js re-validates
// everything again at run time regardless).
const ALLOWED_AGGREGATES = new Set(["sum", "avg", "min", "max", "count"]);

// Every widget mutation (add/update/delete/reposition) is an "edit" action
// on the PARENT dashboard — a widget has no rights of its own, only the
// dashboard it belongs to does (same resolveDashboardRights check
// dashboardServices.js's own loadOwnedDashboard uses, personal scope
// enforced as 404 there too — see that function's own comment).
async function loadOwnedDashboard(req, dashboardId) {
  const { a_application_login_id } = req.body || {};
  if (!dashboardId || !a_application_login_id) {
    return { error: resError({ developer_msg: "dashboard id and a_application_login_id are required" }) };
  }
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId) {
    return { error: resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" }) };
  }
  const company_masters_id = findCompanyId.company_masters_id;

  const rights = await resolveDashboardRights({ company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
  if (!rights.canEdit) {
    return { error: resError({ code: 403, ack_msg: "You don't have permission to edit dashboards", developer_msg: "No Dashboard Builder edit rights for this login" }) };
  }

  const Dashboard = dashboardModel(req.tenantDB);
  const dashboard = await Dashboard.findOne({ where: { id: dashboardId, company_masters_id, isDelete: 0 } });
  if (!dashboard) {
    return { error: resError({ code: 404, ack_msg: "Dashboard not found", developer_msg: "No matching dashboard for this company" }) };
  }
  if (!rights.showAllData && dashboard.a_application_login_id !== Number(a_application_login_id)) {
    return { error: resError({ code: 404, ack_msg: "Dashboard not found", developer_msg: "Not visible under this login's personal data scope" }) };
  }
  return { dashboard, company_masters_id };
}

// A widget row carries no company_masters_id of its own — ownership is
// always resolved through its parent dashboard, same IDOR-guard shape every
// other report_builder lookup uses (findOne scoped by company_masters_id).
async function loadOwnedWidget(req) {
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

  const rights = await resolveDashboardRights({ company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
  if (!rights.canEdit) {
    return { error: resError({ code: 403, ack_msg: "You don't have permission to edit dashboards", developer_msg: "No Dashboard Builder edit rights for this login" }) };
  }

  const Widget = dashboardWidgetModel(req.tenantDB);
  const widget = await Widget.findOne({ where: { id, isDelete: 0 } });
  if (!widget) {
    return { error: resError({ code: 404, ack_msg: "Widget not found", developer_msg: "No matching widget" }) };
  }
  const Dashboard = dashboardModel(req.tenantDB);
  const dashboard = await Dashboard.findOne({ where: { id: widget.dashboard_id, company_masters_id, isDelete: 0 } });
  if (!dashboard) {
    return { error: resError({ code: 404, ack_msg: "Widget not found", developer_msg: "Widget's dashboard does not belong to this company" }) };
  }
  if (!rights.showAllData && dashboard.a_application_login_id !== Number(a_application_login_id)) {
    return { error: resError({ code: 404, ack_msg: "Widget not found", developer_msg: "Not visible under this login's personal data scope" }) };
  }
  return { widget, dashboard, company_masters_id };
}

export const addWidget = async (req) => {
  try {
    const { id: dashboardId } = req.params || {};
    const { report_definition_id, widget_type, title, chart_config_json, position_x, position_y, width, height } = req.body || {};
    if (!report_definition_id || !widget_type) {
      return resError({ developer_msg: "report_definition_id and widget_type are required" });
    }

    const { dashboard, company_masters_id, error } = await loadOwnedDashboard(req, dashboardId);
    if (error) return error;

    const Widget = dashboardWidgetModel(req.tenantDB);
    const existingCount = await Widget.count({ where: { dashboard_id: dashboard.id, isDelete: 0 } });
    if (existingCount >= MAX_WIDGETS_PER_DASHBOARD) {
      return resError({ developer_msg: `A dashboard can have at most ${MAX_WIDGETS_PER_DASHBOARD} widgets` });
    }

    // report_definition_id is a loose reference (no DB-level FK) but still
    // real-world-validated here — must exist, and belong to the SAME
    // company (never trust an id from the client alone).
    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definition = await ReportDefinition.findOne({ where: { id: report_definition_id, company_masters_id, isDelete: 0 } });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    const created = await Widget.create({
      dashboard_id: dashboard.id,
      report_definition_id,
      widget_type,
      title: title || null,
      chart_config_json: chart_config_json ? asJsonString(chart_config_json) : null,
      position_x: position_x ?? 0,
      position_y: position_y ?? 0,
      width: width ?? 4,
      height: height ?? 3,
      display_order: existingCount,
      created_date_time: now(),
    });

    return resSuccess({ data: { item: created }, ack_msg: "Widget added successfully" });
  } catch (e) {
    console.error("addWidget error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Add-Widget modal's "quick counter" shortcut — model_key + one column +
// aggregate op, no trip through the full Report Builder wizard. Behind the
// scenes this still creates a REAL report_definitions row (same
// columns_json shape createReportDefinition's own query-type branch
// produces, same queryEngine.js re-validates at run time) — is_dashboard_only
// marks it as auto-created plumbing so listReportDefinitions/
// listRunnableReportDefinitions filter it out of the main Report Builder
// list (see migration 20260905170000-add-is-dashboard-only-to-report-definitions.js).
export const addQuickCounterWidget = async (req) => {
  try {
    const { id: dashboardId } = req.params || {};
    const { a_application_login_id, model_key, column, aggregate, label, title } = req.body || {};
    if (!model_key || !column || !aggregate) {
      return resError({ developer_msg: "model_key, column and aggregate are required" });
    }
    if (!ALLOWED_AGGREGATES.has(aggregate)) {
      return resError({ ack_msg: "Unknown aggregate", developer_msg: `aggregate "${aggregate}" is not allowed` });
    }

    const registryEntry = getRegisteredModel(model_key);
    if (!registryEntry) {
      return resError({ ack_msg: "Unknown report source", developer_msg: `model_key "${model_key}" is not whitelisted` });
    }
    const columnDef = registryEntry.columns?.[column];
    if (!columnDef) {
      return resError({ ack_msg: "Unknown column", developer_msg: `column "${column}" is not whitelisted on model_key "${model_key}"` });
    }
    if (columnDef.aggregatable && !columnDef.aggregatable.includes(aggregate)) {
      return resError({ ack_msg: "Aggregate not supported", developer_msg: `column "${column}" does not support aggregate "${aggregate}"` });
    }

    const { dashboard, company_masters_id, error } = await loadOwnedDashboard(req, dashboardId);
    if (error) return error;

    const Widget = dashboardWidgetModel(req.tenantDB);
    const existingCount = await Widget.count({ where: { dashboard_id: dashboard.id, isDelete: 0 } });
    if (existingCount >= MAX_WIDGETS_PER_DASHBOARD) {
      return resError({ developer_msg: `A dashboard can have at most ${MAX_WIDGETS_PER_DASHBOARD} widgets` });
    }

    const alias = `${aggregate}_${column}`;
    const displayLabel = label || `${humanize(aggregate)} ${humanize(column)}`;
    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const createdDefinition = await ReportDefinition.create({
      company_masters_id,
      a_application_login_id,
      name: title || displayLabel,
      type: "query",
      page_id: PAGE_ID.REPORT_BUILDER,
      model_key,
      columns_json: asJsonString([{ column, aggregate, alias, label: displayLabel }]),
      is_dashboard_only: 1,
      created_date_time: now(),
    });

    const created = await Widget.create({
      dashboard_id: dashboard.id,
      report_definition_id: createdDefinition.id,
      widget_type: "stat_tile",
      title: title || displayLabel,
      chart_config_json: asJsonString({ valueColumn: alias, label: displayLabel }),
      position_x: 0,
      position_y: 0,
      width: 3,
      height: 2,
      display_order: existingCount,
      created_date_time: now(),
    });

    await logAuditEvent(req, {
      module_key: "dashboard_builder",
      action: "create_quick_counter",
      entity_type: "dashboard_widget",
      entity_id: created.id,
      details: { dashboard_id: dashboard.id, report_definition_id: createdDefinition.id, model_key, column, aggregate },
    });

    return resSuccess({ data: { item: created }, ack_msg: "Counter widget added successfully" });
  } catch (e) {
    console.error("addQuickCounterWidget error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const updateWidget = async (req) => {
  try {
    const { widget, error } = await loadOwnedWidget(req);
    if (error) return error;
    const { widget_type, title, chart_config_json, position_x, position_y, width, height } = req.body || {};

    const patch = { modified_date: now() };
    if (widget_type !== undefined) patch.widget_type = widget_type;
    if (title !== undefined) patch.title = title || null;
    if (chart_config_json !== undefined) patch.chart_config_json = chart_config_json ? asJsonString(chart_config_json) : null;
    if (position_x !== undefined) patch.position_x = position_x;
    if (position_y !== undefined) patch.position_y = position_y;
    if (width !== undefined) patch.width = width;
    if (height !== undefined) patch.height = height;

    await widget.update(patch);

    return resSuccess({ data: { item: widget }, ack_msg: "Widget updated successfully" });
  } catch (e) {
    console.error("updateWidget error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteWidget = async (req) => {
  try {
    const { widget, error } = await loadOwnedWidget(req);
    if (error) return error;

    await widget.update({ isDelete: 1, modified_date: now() });

    return resSuccess({ ack_msg: "Widget deleted successfully" });
  } catch (e) {
    console.error("deleteWidget error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Batch position/size update — a grid-layout drag session naturally
// produces the whole layout array at once (react-grid-layout's own
// onLayoutChange shape), not one widget at a time. Sequential updates
// (not Promise.all) — small, already-verified set, same conservative
// default the rest of this module uses for multi-row writes.
export const updateWidgetPositions = async (req) => {
  try {
    const { id: dashboardId } = req.params || {};
    const { positions } = req.body || {};
    if (!Array.isArray(positions) || positions.length === 0) {
      return resError({ developer_msg: "positions (non-empty array) is required" });
    }

    const { dashboard, error } = await loadOwnedDashboard(req, dashboardId);
    if (error) return error;

    const Widget = dashboardWidgetModel(req.tenantDB);
    const ownedIds = new Set(
      (await Widget.findAll({ where: { dashboard_id: dashboard.id, isDelete: 0 }, attributes: ["id"] })).map((w) => w.id),
    );

    for (const p of positions) {
      if (!ownedIds.has(Number(p.id))) continue; // silently skip anything not on this dashboard
      await Widget.update(
        { position_x: p.position_x, position_y: p.position_y, width: p.width, height: p.height, modified_date: now() },
        { where: { id: p.id } },
      );
    }

    return resSuccess({ ack_msg: "Positions updated successfully" });
  } catch (e) {
    console.error("updateWidgetPositions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
