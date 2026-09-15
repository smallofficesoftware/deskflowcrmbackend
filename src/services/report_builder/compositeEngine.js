// "Metrics per team member" report type — formalizes the pattern every
// team*ReportServices.js file in this codebase hand-rolls (loop every team
// member, fire several queries per person, merge into one row per member).
// Genuinely better than the original: ONE batched, GROUP BY query per
// metric covers every member at once, instead of one query per metric PER
// member.
import { col, fn, Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { getReportDataScope } from "./dataScopeService.js";
import { getRegisteredMetric } from "./metricsRegistry.js";
import { getRegisteredModel } from "./modelRegistry.js";
import { COMPUTE_OPS, evaluateCaseSpec } from "./queryEngine.js";

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

    const { scope } = await getReportDataScope({
      report_definition_id: definition.id,
      a_application_login_id,
      company_masters_id: resolvedCompanyId,
      tenantDB: req.tenantDB,
    });
    if (!scope) {
      return resError({ ack_msg: "No access to this report", developer_msg: "No report_definition_team_rights grant for this login on this report" });
    }
    // "chain" has no defined meaning for a composite report — its dimension
    // is team members, not contacts, so there's no chain to walk. Falls
    // back to "own" (just this login), same documented-limitation rule
    // dataScopeService.js's buildChainWhere uses for a table with no
    // contact relation.
    const showAllData = scope === "all";

    // columns_json for composite type was originally a plain array of
    // metric-key strings — still is, for backward compatibility. Now also
    // accepts derived-column entries mixed in, same {compute:{...}}/
    // {case:{...}} shape query-type's own derived columns use (queryEngine.js
    // exports the shared evaluators rather than duplicating them here) — e.g.
    // targetIncentiveReportServices' achievement percentage/incentive calc/
    // status bucket, computed from metrics dimensioned by team member
    // instead of query-type's row-level aggregates. Order preserved (a
    // derived column may reference an earlier derived column's alias, same
    // "declaration order = dependency order" rule queryEngine.js enforces).
    const rawEntries = JSON.parse(definition.columns_json || "[]");
    const metricKeys = rawEntries.filter((e) => typeof e === "string");
    const derivedSpecs = [];
    const availableFields = new Set(metricKeys);
    for (const e of rawEntries) {
      if (typeof e === "string") continue;
      if (e.compute) {
        if (!COMPUTE_OPS[e.compute.op]) throw new Error(`Compute op "${e.compute.op}" is not allowed`);
        if (!e.alias) throw new Error("A computed column requires an alias");
        if (!availableFields.has(e.compute.left)) throw new Error(`Computed column "${e.alias}" references "${e.compute.left}", which isn't a selected metric`);
        if (!availableFields.has(e.compute.right)) throw new Error(`Computed column "${e.alias}" references "${e.compute.right}", which isn't a selected metric`);
        derivedSpecs.push({ kind: "compute", op: e.compute.op, left: e.compute.left, right: e.compute.right, alias: e.alias });
        availableFields.add(e.alias);
      } else if (e.case) {
        if (!e.alias) throw new Error("A case column requires an alias");
        if (!Array.isArray(e.case.branches) || e.case.branches.length === 0) throw new Error(`Case column "${e.alias}" requires at least one branch`);
        for (const branch of e.case.branches) {
          if (!Array.isArray(branch.when) || branch.when.length === 0) throw new Error(`Case column "${e.alias}" has a branch with no conditions`);
          for (const cond of branch.when) {
            if (!availableFields.has(cond.field)) throw new Error(`Case column "${e.alias}" references "${cond.field}", which isn't a selected metric`);
          }
        }
        derivedSpecs.push({ kind: "case", branches: e.case.branches, else: e.case.else, alias: e.alias });
        availableFields.add(e.alias);
      } else {
        throw new Error("Each columns_json entry must be a metric key string, or a {compute} / {case} derived column");
      }
    }

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

    // Derived columns, applied last (after every metric is on every row),
    // in declaration order — same evaluators query-type uses.
    if (derivedSpecs.length > 0) {
      rowsOut.forEach((r) => {
        derivedSpecs.forEach((spec) => {
          r[spec.alias] = spec.kind === "compute" ? COMPUTE_OPS[spec.op](Number(r[spec.left]) || 0, Number(r[spec.right]) || 0) : evaluateCaseSpec(r, spec);
        });
      });
    }

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
