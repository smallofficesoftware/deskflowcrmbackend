// "Metrics per team member" report type — formalizes the pattern every
// team*ReportServices.js file in this codebase hand-rolls (loop every team
// member, fire several queries per person, merge into one row per member).
// Genuinely better than the original: ONE batched, GROUP BY query per
// metric covers every member at once, instead of one query per metric PER
// member.
import { col, fn, Op } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { getRegisteredMetric } from "./metricsRegistry.js";
import { getRegisteredModel } from "./modelRegistry.js";

const ALLOWED_AGGREGATES = { sum: "SUM", avg: "AVG", min: "MIN", max: "MAX", count: "COUNT" };

// definition: a report_definitions row (type: "composite") — columns_json
// holds the metric KEYS array for this type, same "shape varies by type"
// precedent filters_json already has between query/plugin definitions.
export const runCompositeReport = async (definition, req) => {
  const startedAt = Date.now();
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return resError({ ack_msg: "a_application_login_id is required", developer_msg: "Missing a_application_login_id" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const resolvedCompanyId = findCompanyId.company_masters_id;

    if (definition.company_masters_id && Number(definition.company_masters_id) !== Number(resolvedCompanyId)) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "Report definition does not belong to this company" });
    }
    if (!definition.page_id) {
      throw new Error(`report_definitions row ${definition.id} has no page_id`);
    }

    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: resolvedCompanyId,
      a_application_login_id,
      page_id: definition.page_id,
      tenentId: req.tenantDB,
    });
    if (!showAllData && !showPersonalData) {
      return resError({ ack_msg: "No access to this report", developer_msg: "User has neither showAllData nor showPersonalData rights" });
    }

    const metricKeys = JSON.parse(definition.columns_json || "[]");
    const metrics = metricKeys.map((key) => {
      const m = getRegisteredMetric(key);
      if (!m) throw new Error(`Metric "${key}" is not whitelisted`);
      return { key, ...m };
    });
    if (metrics.length === 0) {
      throw new Error("At least one metric is required");
    }

    // ---- Dimension: team members. showAllData -> every member in the
    // company; showPersonalData -> just this login (fail-closed, same rule
    // queryEngine.js's rights check already enforces for row-level scope —
    // a personal-scoped user can't see other members' aggregates either). ----
    let memberIds;
    if (showAllData) {
      const memberships = await companyVsApplicationLoginModel.findAll({
        where: { company_masters_id: resolvedCompanyId, isDelete: 0 },
        attributes: ["a_application_login_id"],
        raw: true,
      });
      memberIds = [...new Set(memberships.map((m) => m.a_application_login_id))];
    } else {
      memberIds = [Number(a_application_login_id)];
    }

    if (memberIds.length === 0) {
      return resSuccess({ data: { rows: [], row_count: 0, duration_ms: Date.now() - startedAt }, ack_msg: "No data found" });
    }

    const users = await loginModel.findAll({
      where: { id: { [Op.in]: memberIds }, isDelete: 0 },
      attributes: ["id", "username"],
      raw: true,
    });
    const usernameMap = new Map(users.map((u) => [u.id, u.username]));

    const resultsByMember = new Map(memberIds.map((id) => [id, { member_id: id, member_name: usernameMap.get(id) || `ID ${id}` }]));

    // ---- One batched, GROUP BY query per metric — sequential, not
    // Promise.all, same "don't fan concurrent connections into one tenant
    // DB pool" rule runBatchReportDefinitions already follows. ----
    for (const metric of metrics) {
      const registryEntry = getRegisteredModel(metric.modelKey);
      if (!registryEntry) throw new Error(`Metric "${metric.key}" points at an unregistered table`);
      const fnName = ALLOWED_AGGREGATES[metric.aggregate];
      if (!fnName) throw new Error(`Metric "${metric.key}" has an invalid aggregate`);

      const Model = registryEntry.getModel(req.tenantDB);
      const rows = await Model.findAll({
        attributes: [metric.dimensionColumn, [fn(fnName, col(metric.column)), "value"]],
        where: {
          company_masters_id: resolvedCompanyId,
          isDelete: 0,
          [metric.dimensionColumn]: { [Op.in]: memberIds },
          // Fixed equality condition (e.g. carts.type = 1 for
          // "Quotations only") — server-authored in metricsRegistry.js,
          // never from report_definitions input.
          ...(metric.filter ? { [metric.filter.column]: metric.filter.value } : {}),
        },
        group: [metric.dimensionColumn],
        raw: true,
      });

      rows.forEach((r) => {
        const bucket = resultsByMember.get(r[metric.dimensionColumn]);
        if (bucket) bucket[metric.key] = Number(r.value) || 0;
      });
      // A member with zero matching rows never appears in `rows` — backfill.
      memberIds.forEach((id) => {
        const bucket = resultsByMember.get(id);
        if (bucket[metric.key] === undefined) bucket[metric.key] = 0;
      });
    }

    const rowsOut = [...resultsByMember.values()];
    return resSuccess({
      data: { rows: rowsOut, row_count: rowsOut.length, duration_ms: Date.now() - startedAt },
      ack_msg: rowsOut.length > 0 ? "Report data retrieved successfully" : "No data found",
    });
  } catch (error) {
    console.error("runCompositeReport error:", error);
    return resError({
      ack_msg: "Failed to run report",
      developer_msg: error.message || String(error),
    });
  }
};
