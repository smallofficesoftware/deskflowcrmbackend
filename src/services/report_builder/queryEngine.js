import { col, fn, Op, where as sequelizeWhere } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { getRegisteredModel, resolveDynamicColumns } from "./modelRegistry.js";

const HARD_ROW_LIMIT = 5000; // absolute ceiling regardless of what's requested
const DEFAULT_ROW_LIMIT = 500;
// Best-effort only — Promise.race below fails the *request* on timeout, it
// does not cancel the underlying MySQL query server-side (no MAX_EXECUTION_TIME
// hint or dedicated low-priv reporting DB user exists in this codebase to do
// that properly yet). A real statement timeout is a follow-up, not solved here.
const QUERY_TIMEOUT_MS = 15000;

const ALLOWED_OPERATORS = {
  eq: Op.eq,
  ne: Op.ne,
  in: Op.in,
  notIn: Op.notIn,
  gt: Op.gt,
  gte: Op.gte,
  lt: Op.lt,
  lte: Op.lte,
  between: Op.between,
  like: Op.like,
};

const ALLOWED_AGGREGATES = { sum: "SUM", avg: "AVG", min: "MIN", max: "MAX", count: "COUNT" };

// One where-clause entry for a single whitelisted, filterable column. Throws
// (caught by the caller, turned into resError) if the column isn't in the
// registry, isn't filterable, or the operator isn't in ALLOWED_OPERATORS —
// never falls through to a raw/literal query fragment.
function buildFilterCondition(columnDef, columnKey, filter) {
  if (!columnDef || !columnDef.filterable) {
    throw new Error(`Column "${columnKey}" is not filterable`);
  }
  const operator = ALLOWED_OPERATORS[filter.op || "eq"];
  if (!operator) {
    throw new Error(`Operator "${filter.op}" is not allowed`);
  }
  return { [columnKey]: { [operator]: filter.value } };
}

// definition: a report_definitions row, already scoped-checked by the caller
// (reportDefinitionServices.js's runReportDefinition re-checks company_masters_id
// before this is ever called — the check below is defense in depth, not the
// only check). req: needs req.tenantDB and req.body.a_application_login_id.
export const runQueryReport = async (definition, req) => {
  const startedAt = Date.now();
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return resError({ ack_msg: "a_application_login_id is required", developer_msg: "Missing a_application_login_id" });
    }

    const registryEntry = getRegisteredModel(definition.model_key);
    if (!registryEntry) {
      return resError({ ack_msg: "Unknown report source", developer_msg: `model_key "${definition.model_key}" is not whitelisted` });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const resolvedCompanyId = findCompanyId.company_masters_id;

    // IDOR defense in depth — the definition must belong to the resolved
    // company even though the caller already checked this once.
    if (definition.company_masters_id && Number(definition.company_masters_id) !== Number(resolvedCompanyId)) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "Report definition does not belong to this company" });
    }

    // page_id is now enforced at create time (createReportDefinition
    // always sets one — PAGE_ID.REPORT_BUILDER for query-type, the
    // matching plugin's own page_id for plugin-type), so a definition
    // reaching here with no page_id is a real bug upstream, not a case to
    // silently default around.
    if (!definition.page_id) {
      throw new Error(`report_definitions row ${definition.id} has no page_id`);
    }
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: resolvedCompanyId,
      a_application_login_id,
      page_id: definition.page_id,
      tenentId: req.tenantDB,
    });

    // Per-company dynamic custom-field columns, merged into a LOCAL copy —
    // MODEL_REGISTRY's static entry is never mutated. {} for every table
    // without customFieldFormType (the common case).
    const dynamicColumns = await resolveDynamicColumns(req.tenantDB, resolvedCompanyId, registryEntry.customFieldFormType);
    const effectiveColumns = { ...registryEntry.columns, ...dynamicColumns };

    const columns = JSON.parse(definition.columns_json || "[]");
    const filters = JSON.parse(definition.filters_json || "[]");
    const groupBy = JSON.parse(definition.group_by_json || "[]");

    // ---- Split base-table columns from whitelisted relation columns
    // (dotted "relKey.colKey", e.g. "customer.person_name") — relation
    // columns are select/display only in v1: no aggregate, never used for
    // filter/group-by (those loops below never look at registryEntry.relations
    // at all, so a relation column simply isn't a valid filter/group-by
    // target — same "throws like any unwhitelisted column" behavior). ----
    const baseColumns = [];
    const relationColumns = [];
    for (const c of columns) {
      if (c.column.includes(".")) {
        const [relKey, relColKey] = c.column.split(".");
        const relDef = registryEntry.relations && registryEntry.relations[relKey];
        if (!relDef) throw new Error(`Relation "${relKey}" is not whitelisted for this report source`);
        if (!relDef.columns[relColKey]) throw new Error(`Relation column "${c.column}" is not whitelisted`);
        if (c.aggregate) throw new Error(`Relation column "${c.column}" does not support aggregates`);
        relationColumns.push({ relKey, relColKey });
      } else {
        baseColumns.push(c);
      }
    }

    // ---- SELECT / aggregate list, whitelisted only ----
    const explicitlySelectedBaseColumns = new Set();
    const attributes = [];
    for (const c of baseColumns) {
      const columnDef = effectiveColumns[c.column];
      if (!columnDef) throw new Error(`Column "${c.column}" is not whitelisted for this report source`);
      explicitlySelectedBaseColumns.add(c.column);
      if (c.aggregate) {
        const fnName = ALLOWED_AGGREGATES[c.aggregate];
        if (!fnName) throw new Error(`Aggregate "${c.aggregate}" is not allowed`);
        if (columnDef.aggregatable && !columnDef.aggregatable.includes(c.aggregate)) {
          throw new Error(`Column "${c.column}" does not support aggregate "${c.aggregate}"`);
        }
        attributes.push([fn(fnName, col(c.column)), c.alias || `${c.aggregate}_${c.column}`]);
      } else {
        attributes.push(c.column);
      }
    }

    // ---- Inject FK columns needed by referenced relations (so the merge
    // step below has a join key to work with), even if the user didn't
    // explicitly select the FK column itself for display. Tracked so it
    // can be stripped back out after the merge. ----
    const usedRelationKeys = [...new Set(relationColumns.map((c) => c.relKey))];
    const injectedFkColumns = [];
    for (const relKey of usedRelationKeys) {
      const foreignKey = registryEntry.relations[relKey].foreignKey;
      if (!explicitlySelectedBaseColumns.has(foreignKey) && !injectedFkColumns.includes(foreignKey)) {
        injectedFkColumns.push(foreignKey);
        attributes.push(foreignKey);
      }
    }

    // ---- GROUP BY, whitelisted only ----
    const group = [];
    for (const g of groupBy) {
      const columnDef = effectiveColumns[g];
      if (!columnDef || !columnDef.groupable) throw new Error(`Column "${g}" is not groupable`);
      group.push(g);
    }

    // ---- user-supplied filters, whitelisted columns/operators, bound values only.
    // A "csv" column (contacts.lable, task_managements.label_id — CSV-of-ids,
    // confirmed by reading the models, not a scalar FK) only supports
    // "findInSet", built via Sequelize's fn()/col()/where() — a bound-value
    // function call, not string-interpolated SQL, same safety class as every
    // other operator here. Pushed into its own array because it can't be
    // merged into the flat userWhere object the way {col: {op: val}} can. ----
    const userWhere = {};
    const csvWhereClauses = [];
    for (const f of filters) {
      const columnDef = effectiveColumns[f.column];
      if (columnDef && columnDef.type === "csv") {
        if (!columnDef.filterable) throw new Error(`Column "${f.column}" is not filterable`);
        if (f.op !== "findInSet") throw new Error(`Operator "${f.op}" is not allowed on CSV column "${f.column}"`);
        csvWhereClauses.push(sequelizeWhere(fn("FIND_IN_SET", String(f.value), col(f.column)), { [Op.gt]: 0 }));
        continue;
      }
      Object.assign(userWhere, buildFilterCondition(columnDef, f.column, f));
    }

    // ---- rights-based scope — fail closed, never fall back to unscoped ----
    let rightsWhere = {};
    if (showAllData) {
      rightsWhere = { company_masters_id: resolvedCompanyId };
    } else if (showPersonalData) {
      rightsWhere = { company_masters_id: resolvedCompanyId, a_application_login_id };
    } else {
      return resError({ ack_msg: "No access to this report", developer_msg: "User has neither showAllData nor showPersonalData rights" });
    }

    // ---- tenant/company scope injected LAST so a filter can never override it ----
    const baseWhere = {
      ...userWhere,
      ...rightsWhere,
      isDelete: 0,
    };
    // csvWhereClauses (sequelize.where(fn(...)) instances) can't merge into
    // a plain object the way {col: {op: val}} fragments can — combined via
    // Op.and instead. Flat shape (unchanged from before) when there are none.
    const where = csvWhereClauses.length > 0 ? { [Op.and]: [baseWhere, ...csvWhereClauses] } : baseWhere;

    const requestedLimit = Number(req.body.limit) || DEFAULT_ROW_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), HARD_ROW_LIMIT);
    const offset = Number(req.body.offset) || 0;

    const Model = registryEntry.getModel(req.tenantDB);

    const timeoutGuard = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Report query timed out")), QUERY_TIMEOUT_MS),
    );

    const rows = await Promise.race([
      Model.findAll({
        attributes: attributes.length ? attributes : undefined,
        where,
        group: group.length ? group : undefined,
        limit,
        offset,
        raw: true,
      }),
      timeoutGuard,
    ]);

    // ---- Whitelisted relations — one batched query per relation + a JS
    // Map merge, matching this codebase's own existing join convention
    // (see customerSalesPurchaseReportServices.js) rather than a Sequelize
    // `include` (no association is declared anywhere in this codebase).
    // Skipped entirely when there are no rows or no relation columns were
    // requested — never fires a query with an empty Op.in. ----
    if (rows.length > 0) {
      for (const relKey of usedRelationKeys) {
        const relDef = registryEntry.relations[relKey];
        const relColKeys = relationColumns.filter((c) => c.relKey === relKey).map((c) => c.relColKey);
        const isCsv = relDef.matchMode === "csv";

        // csv: each row's FK column is "3,7,12" — split every row's value
        // and flatten into one distinct id set for a single batched fetch
        // (never split-then-fetch-per-row — same "one query, not N+1" rule
        // as the scalar case below).
        const splitCsv = (raw) =>
          String(raw ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .map(Number)
            .filter((n) => !Number.isNaN(n));

        const distinctFkValues = isCsv
          ? [...new Set(rows.flatMap((r) => splitCsv(r[relDef.foreignKey])))]
          : [...new Set(rows.map((r) => r[relDef.foreignKey]).filter((v) => v !== null && v !== undefined))];

        const relMap = new Map();
        if (distinctFkValues.length > 0) {
          const RelatedModel = relDef.getModel(req.tenantDB);
          const relatedRows = await RelatedModel.findAll({
            where: { [relDef.targetKey]: { [Op.in]: distinctFkValues }, isDelete: 0 },
            attributes: [relDef.targetKey, ...relColKeys],
            raw: true,
          });
          relatedRows.forEach((rr) => relMap.set(rr[relDef.targetKey], rr));
        }

        rows.forEach((r) => {
          if (isCsv) {
            const ids = splitCsv(r[relDef.foreignKey]);
            relColKeys.forEach((relColKey) => {
              r[`${relKey}.${relColKey}`] = ids
                .map((id) => relMap.get(id)?.[relColKey])
                .filter((v) => v !== undefined && v !== null)
                .join(", ");
            });
          } else {
            const relatedRow = relMap.get(r[relDef.foreignKey]);
            relColKeys.forEach((relColKey) => {
              r[`${relKey}.${relColKey}`] = relatedRow ? relatedRow[relColKey] ?? null : null;
            });
          }
        });
      }
    }

    // FK columns injected only to support a relation join, never explicitly
    // selected by the user, don't belong in the result they asked for.
    if (injectedFkColumns.length > 0) {
      rows.forEach((r) => injectedFkColumns.forEach((fk) => delete r[fk]));
    }

    return resSuccess({
      data: { rows, row_count: rows.length, duration_ms: Date.now() - startedAt },
      ack_msg: rows.length > 0 ? "Report data retrieved successfully" : "No data found",
    });
  } catch (error) {
    console.error("runQueryReport error:", error);
    return resError({
      ack_msg: "Failed to run report",
      developer_msg: error.message || String(error),
    });
  }
};
