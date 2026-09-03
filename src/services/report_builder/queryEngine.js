import { col, fn, Op, where as sequelizeWhere } from "sequelize";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { buildChainWhere, getReportDataScope } from "./dataScopeService.js";
import { getRegisteredModel, resolveDynamicColumns, resolveRelationColumns, resolveRelationRelations } from "./modelRegistry.js";

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

// Computed columns — plain JS arithmetic between two values ALREADY on the
// row by the end of the pipeline (an aggregate/running-total alias, or a
// selected relation column, e.g. closingQty × product.purchase_rate for
// stock value, or achieved/target × 100 for an achievement percentage).
// Not a formula string / eval — a small whitelisted op set over two named
// fields, same "whitelist not arbitrary expression" philosophy as every
// other primitive here. divide/percentage guard against a zero denominator
// (0, not Infinity/NaN — a report cell should never render a JS special value).
export const COMPUTE_OPS = {
  multiply: (a, b) => a * b,
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  divide: (a, b) => (b ? a / b : 0),
  percentage: (a, b) => (b ? (a / b) * 100 : 0), // e.g. achieved/target * 100 (a ratio)
  percentOf: (a, b) => (a * b) / 100, // e.g. incentive_value% of achieved_value (a rate applied to an amount)
};

// Shared by the CSV-relation display merge and CSV group-by below — a raw
// value like "3,7,12" (or a plain scalar, which still splits into a single-
// element array) becomes a real numeric id array.
function splitCsv(raw) {
  return String(raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

// JS-side evaluator for a having filter (see havingSpecs in runQueryReport)
// — mirrors ALLOWED_OPERATORS' semantics but runs against an already-
// computed row value in memory, not a SQL WHERE fragment.
function evaluateHavingOperator(op, actual, expected) {
  switch (op) {
    case "eq": return actual === expected;
    case "ne": return actual !== expected;
    case "gt": return actual > expected;
    case "gte": return actual >= expected;
    case "lt": return actual < expected;
    case "lte": return actual <= expected;
    case "in": return Array.isArray(expected) && expected.includes(actual);
    case "notIn": return Array.isArray(expected) && !expected.includes(actual);
    case "between": return Array.isArray(expected) && actual >= expected[0] && actual <= expected[1];
    default: throw new Error(`Operator "${op}" is not allowed on a having filter`);
  }
}

// Case/branch columns — "targetIncentiveReportServices' incentive calc and
// status bucket" shape: a value tested against N conditions in order, first
// match wins, each branch (and `else`) resolving to either a literal, a
// pass-through of another already-derived field ({ref: fieldName}), or a
// small compute expression ({compute: {op,left,right}}, reusing COMPUTE_OPS).
// A branch's `when` is an AND-list of conditions (same operator set as
// having filters); OR-of-ANDs is expressed as multiple branches with the
// same `then` — e.g. targetIncentiveReportServices' flat-incentive rule
// ("(count target hit) OR (value target hit) OR (no target set at all)")
// becomes 3 branches all resolving to the same incentive_value pass-through,
// rather than a new "or" primitive — same "whitelist small pieces, compose
// them" philosophy as everything else here, not an expression parser.
function resolveValueRef(row, value) {
  return value && typeof value === "object" && "ref" in value ? row[value.ref] : value;
}

function resolveDerivedValue(row, spec) {
  if (spec && typeof spec === "object") {
    if ("ref" in spec) return row[spec.ref];
    if (spec.compute) return COMPUTE_OPS[spec.compute.op](Number(row[spec.compute.left]) || 0, Number(row[spec.compute.right]) || 0);
  }
  return spec; // literal (string/number/null)
}

export function evaluateCaseSpec(row, spec) {
  for (const branch of spec.branches) {
    const matches = branch.when.every((cond) => evaluateHavingOperator(cond.op, row[cond.field], resolveValueRef(row, cond.value)));
    if (matches) return resolveDerivedValue(row, branch.then);
  }
  return spec.else !== undefined ? resolveDerivedValue(row, spec.else) : null;
}

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
    const { scope } = await getReportDataScope({
      report_definition_id: definition.id,
      a_application_login_id,
      company_masters_id: resolvedCompanyId,
      tenantDB: req.tenantDB,
    });

    // Per-company dynamic custom-field columns, merged into a LOCAL copy —
    // MODEL_REGISTRY's static entry is never mutated. {} for every table
    // without customFieldFormType (the common case).
    const dynamicColumns = await resolveDynamicColumns(req.tenantDB, resolvedCompanyId, registryEntry.customFieldFormType);
    const effectiveColumns = { ...registryEntry.columns, ...dynamicColumns };

    // Drill Down (Step 9) — req.body.suppressGroupBy:true reuses this
    // exact SAME "no group_by" code path every ungrouped query-type report
    // already exercises correctly, for one request, without touching the
    // GROUP BY machinery's internals at all: groupBy simply comes back
    // empty (so sqlGroupColumns/csvGroupColumn naturally stay empty/null
    // downstream, no separate branch needed), and each column's own
    // `aggregate` is stripped so SUM/AVG/etc. don't collapse the result
    // back down to one row per FN() with no GROUP BY to pair it with —
    // the whole point is the underlying raw rows a grouped/aggregated row
    // was built from, not another aggregate.
    const suppressGroupBy = req.body?.suppressGroupBy === true;
    const columns = JSON.parse(definition.columns_json || "[]").map((c) => (suppressGroupBy ? { ...c, aggregate: undefined } : c));
    const groupBy = suppressGroupBy ? [] : JSON.parse(definition.group_by_json || "[]");
    // Per-run filter override — the saved definition's own filters_json,
    // PLUS whatever the caller passes at run time (req.body.filters, same
    // {column,op,value}/{column,having,op,value}/{column,childFilters}
    // shape as filters_json — never a raw string/SQL fragment). Appended,
    // not replacing: every runtime filter still goes through the exact same
    // whitelist/validation loop below as a saved one (buildFilterCondition,
    // the csv/having/inbound branches) — this is a different filter SOURCE,
    // not a new security surface. Lets a UI reuse one saved query-type
    // definition with a live picker (e.g. a stock-bucket dropdown mapped to
    // a having filter on closing_stock, or a warehouse_id filter) instead of
    // needing a separate saved definition per combination — the gap plugin-
    // type definitions never had (runDefinitionByType already merges
    // req.body over a plugin's own saved filters_json the same way).
    const runtimeFilters = Array.isArray(req.body?.filters) ? req.body.filters : [];
    // A having-filter targets a computedAlias (an aggregate) that no
    // longer exists once suppressGroupBy has stripped every column's
    // aggregate above — dropped here rather than left to throw, since a
    // drill-down request legitimately has nothing to filter it against.
    const filters = [...JSON.parse(definition.filters_json || "[]"), ...runtimeFilters].filter((f) => !(suppressGroupBy && f.having));

    // Relation-required filters — "drop this row if its relation lookup
    // found nothing" (e.g. categorySalesPurchaseServices.js's NOT EXISTS
    // anti-join excluding transactions whose category was later soft-
    // deleted: the relation fetch below already filters isDelete:0, so a
    // deleted target simply won't appear in relMap — this makes that count
    // as "row excluded" instead of "row kept with a null display value").
    // Collected here, ahead of the relation-resolution block below, purely
    // so a relKey named ONLY in a relationRequired filter (no display
    // column selected for it) still gets its relMap built — real validation
    // (relKey exists, not a csv/reverse relation) happens in the main
    // filters loop same as every other filter type, this is just eager
    // discovery. v1 scope matches relationFilters above: scalar relations only.
    const relationRequiredKeys = new Set(filters.filter((f) => f.relationRequired).map((f) => f.column));

    // ---- Split base-table columns from whitelisted relation columns
    // (dotted "relKey.colKey", e.g. "customer.person_name") — relation
    // columns are select/display only in v1: no aggregate, never used for
    // filter/group-by (those loops below never look at registryEntry.relations
    // at all, so a relation column simply isn't a valid filter/group-by
    // target — same "throws like any unwhitelisted column" behavior). ----
    const baseColumns = [];
    const relationColumns = [];
    // Two-hop relation columns — "relKey.subRelKey.subColKey" (e.g.
    // "contact.label.lable_name"). Only reachable through a modelKey-backed,
    // plain-scalar level-1 relation (see resolveRelationRelations) — chaining
    // off a csv/reverse relation isn't supported, same v1 restriction the
    // single-hop relation-filter code already applies. Resolved below as one
    // MORE batched fetch on top of the level-1 relation's own, keyed off the
    // level-1 target row's own foreignKey — no Sequelize `include`, same
    // "one batched query + JS Map merge" convention as everywhere else here.
    const nestedRelationColumns = [];
    // Computed columns — {compute:{op,left,right}, alias} instead of
    // {column,...} — pulled out here so the base/relation loop below never
    // has to special-case them. left/right are validated against what's
    // actually available on the row (computedAliases, base columns, or
    // relation columns) once the rest of `columns` has been parsed — see
    // the derived-column-resolution block near the end of this function.
    // One ordered array for both kinds (not two separate lists) so a later
    // entry can reference an earlier one's alias in declaration order —
    // e.g. a "case" status-bucket column referencing a "compute" percentage
    // column defined just before it in columns_json.
    const derivedSpecs = []; // {kind:"compute"|"case", ...}
    for (const c of columns) {
      if (c.compute) {
        if (!COMPUTE_OPS[c.compute.op]) throw new Error(`Compute op "${c.compute.op}" is not allowed`);
        if (!c.alias) throw new Error("A computed column requires an alias");
        derivedSpecs.push({ kind: "compute", op: c.compute.op, left: c.compute.left, right: c.compute.right, alias: c.alias });
        continue;
      }
      if (c.case) {
        if (!c.alias) throw new Error("A case column requires an alias");
        if (!Array.isArray(c.case.branches) || c.case.branches.length === 0) {
          throw new Error(`Case column "${c.alias}" requires at least one branch`);
        }
        for (const branch of c.case.branches) {
          if (!Array.isArray(branch.when) || branch.when.length === 0) {
            throw new Error(`Case column "${c.alias}" has a branch with no conditions`);
          }
        }
        derivedSpecs.push({ kind: "case", branches: c.case.branches, else: c.case.else, alias: c.alias });
        continue;
      }
      if (c.column.includes(".")) {
        const parts = c.column.split(".");
        const [relKey, ...rest] = parts;
        const relDef = registryEntry.relations && registryEntry.relations[relKey];
        if (!relDef) throw new Error(`Relation "${relKey}" is not whitelisted for this report source`);
        if (c.aggregate) throw new Error(`Relation column "${c.column}" does not support aggregates`);
        if (rest.length === 1) {
          const targetColumns = resolveRelationColumns(relDef);
          if (!targetColumns[rest[0]]) throw new Error(`Relation column "${c.column}" is not whitelisted`);
          relationColumns.push({ relKey, relColKey: rest[0] });
        } else if (rest.length === 2) {
          const [subRelKey, subColKey] = rest;
          if (relDef.matchMode) throw new Error(`Relation "${relKey}" does not support nested (two-hop) columns — only a plain scalar relation can be chained`);
          const subRelations = resolveRelationRelations(relDef);
          const subRelDef = subRelations && subRelations[subRelKey];
          if (!subRelDef) throw new Error(`Relation "${relKey}.${subRelKey}" is not whitelisted for this report source`);
          if (subRelDef.matchMode === "reverse") throw new Error(`Relation "${relKey}.${subRelKey}" does not support nested display (reverse relations aren't chainable)`);
          const subTargetColumns = resolveRelationColumns(subRelDef);
          if (!subTargetColumns[subColKey]) throw new Error(`Relation column "${c.column}" is not whitelisted`);
          nestedRelationColumns.push({ relKey, relDef, subRelKey, subRelDef, subColKey });
        } else {
          throw new Error(`Relation column "${c.column}" is nested too deeply (max two hops)`);
        }
      } else {
        baseColumns.push(c);
      }
    }

    // ---- GROUP BY, whitelisted only. A CSV-typed column (e.g.
    // task_managements.status, contacts.lable) is grouped in JS below, not
    // SQL — SQL GROUP BY on a CSV column groups by the raw string
    // combination ("3,7" as one bucket), not by individual values, which is
    // wrong (confirmed by reading statusWiseReportServices.js/
    // lableWiseReportServices.js — both hand-roll a JS re-expansion step for
    // exactly this reason, the same thing done generically here). At most
    // one CSV column may be grouped at a time (v1 — avoids combinatorial
    // cross-product complexity); it may be combined with any number of
    // ordinary groupable columns, grouped in JS alongside it. ----
    const csvGroupColumns = [];
    const sqlGroupColumns = [];
    for (const g of groupBy) {
      const columnDef = effectiveColumns[g];
      if (!columnDef) throw new Error(`Column "${g}" is not whitelisted for this report source`);
      if (columnDef.type === "csv") {
        csvGroupColumns.push(g);
      } else {
        if (!columnDef.groupable) throw new Error(`Column "${g}" is not groupable`);
        sqlGroupColumns.push(g);
      }
    }
    if (csvGroupColumns.length > 1) {
      throw new Error("Grouping by more than one CSV column at once is not supported");
    }
    const csvGroupColumn = csvGroupColumns[0] || null;

    // ---- SELECT / aggregate list, whitelisted only. When grouping by a
    // CSV column, aggregation runs in JS (below), so aggregate columns are
    // recorded as specs instead of SQL fn() attributes, and any plain
    // (non-aggregate) column must be one of the groupBy dimensions — the
    // same constraint plain SQL GROUP BY enforces (ONLY_FULL_GROUP_BY),
    // just checked here by hand since SQL isn't doing the grouping. ----
    const explicitlySelectedBaseColumns = new Set();
    const attributes = [];
    const aggregateSpecs = []; // {column, aggregate, alias} — only used when csvGroupColumn is set
    const rawFetchColumns = new Set(); // only used when csvGroupColumn is set
    // Every alias that names a COMPUTED value (an aggregate, in either the
    // SQL or CSV group-by path, or a running total) rather than a raw
    // column — the only valid targets for a "having" filter below (a plain
    // WHERE column filter already covers raw columns; this is specifically
    // for filtering on the aggregated/derived result, the HAVING-clause
    // equivalent Crystal Reports calls a "group selection formula").
    const computedAliases = new Set();
    // ---- Running total, whitelisted per-column (e.g. stock_ledger.qty_delta).
    // A generic "cumulative sum over ordered raw rows, reset per partition"
    // primitive — same JS-side-accumulation-over-sorted-rows approach the CSV
    // group-by feature above already uses instead of a MySQL window function
    // (no server-version dependency). Mutually exclusive with SQL/CSV
    // group-by (a running total needs individual ordered rows, grouping
    // collapses them) and with aggregating the SAME column (can't both sum
    // it away and accumulate it row-by-row) — both throw like any other
    // whitelist violation here, not silently ignored. At most one running
    // total column per report (v1 — same "one at a time" scope as
    // csvGroupColumn above). ----
    let runningTotalSpec = null; // {column, alias, partitionBy, orderBy}
    for (const c of baseColumns) {
      const columnDef = effectiveColumns[c.column];
      if (!columnDef) throw new Error(`Column "${c.column}" is not whitelisted for this report source`);
      explicitlySelectedBaseColumns.add(c.column);
      if (c.runningTotal) {
        if (!columnDef.runningTotal) throw new Error(`Column "${c.column}" does not support a running total`);
        if (c.aggregate) throw new Error(`Column "${c.column}" cannot be both aggregated and a running total`);
        if (runningTotalSpec) throw new Error("Only one running-total column is supported per report");
        if (groupBy.length > 0) throw new Error("Running total cannot be combined with group_by");
        runningTotalSpec = {
          column: c.column,
          alias: c.alias || `running_${c.column}`,
          partitionBy: columnDef.runningTotal.partitionBy,
          orderBy: columnDef.runningTotal.orderBy,
        };
        computedAliases.add(runningTotalSpec.alias);
        attributes.push(c.column);
        continue;
      }
      if (c.aggregate) {
        const fnName = ALLOWED_AGGREGATES[c.aggregate];
        if (!fnName) throw new Error(`Aggregate "${c.aggregate}" is not allowed`);
        if (columnDef.aggregatable && !columnDef.aggregatable.includes(c.aggregate)) {
          throw new Error(`Column "${c.column}" does not support aggregate "${c.aggregate}"`);
        }
        const alias = c.alias || `${c.aggregate}_${c.column}`;
        computedAliases.add(alias);
        if (csvGroupColumn) {
          aggregateSpecs.push({ column: c.column, aggregate: c.aggregate, alias });
          rawFetchColumns.add(c.column);
        } else {
          attributes.push([fn(fnName, col(c.column)), alias]);
        }
      } else if (csvGroupColumn) {
        if (c.column !== csvGroupColumn && !sqlGroupColumns.includes(c.column)) {
          throw new Error(`Column "${c.column}" must be aggregated or included in group_by when grouping by a CSV column`);
        }
        rawFetchColumns.add(c.column);
      } else {
        attributes.push(c.column);
      }
    }
    if (csvGroupColumn) {
      rawFetchColumns.add(csvGroupColumn);
      sqlGroupColumns.forEach((g) => rawFetchColumns.add(g));
    }

    // Running total needs its partition/order columns available even if the
    // user didn't explicitly select them for display — same "inject what's
    // needed" convention as the relation FK injection below (not tracked for
    // stripping afterward, unlike those: partitionBy/orderBy are ordinary
    // whitelisted columns a report about a running balance is expected to show).
    if (runningTotalSpec) {
      if (!explicitlySelectedBaseColumns.has(runningTotalSpec.partitionBy)) attributes.push(runningTotalSpec.partitionBy);
      if (!explicitlySelectedBaseColumns.has(runningTotalSpec.orderBy)) attributes.push(runningTotalSpec.orderBy);
    }

    // ---- Inject FK columns needed by referenced relations (so the merge
    // step below has a join key to work with), even if the user didn't
    // explicitly select the FK column itself for display. Tracked so it
    // can be stripped back out after the merge. ----
    // Invalid relationRequiredKeys entries are silently skipped here (not
    // thrown) — the main filters loop below is the single source of truth
    // for validating a relationRequired filter's relKey/matchMode, this is
    // only eager-fetch discovery for the ones that turn out valid.
    const validRelationRequiredKeys = [...relationRequiredKeys].filter((k) => registryEntry.relations && registryEntry.relations[k]);
    const usedRelationKeys = [...new Set([...relationColumns.map((c) => c.relKey), ...nestedRelationColumns.map((c) => c.relKey), ...validRelationRequiredKeys])];
    const injectedFkColumns = [];
    for (const relKey of usedRelationKeys) {
      const foreignKey = registryEntry.relations[relKey].foreignKey;
      if (!explicitlySelectedBaseColumns.has(foreignKey) && !injectedFkColumns.includes(foreignKey)) {
        injectedFkColumns.push(foreignKey);
        if (csvGroupColumn) rawFetchColumns.add(foreignKey);
        else attributes.push(foreignKey);
      }
    }

    // ---- Validate derived-column (compute/case) references — each must
    // already be an explicitly-selected field (a base column, an aggregate/
    // running-total alias, a selected relation column) OR an EARLIER
    // derived column's own alias (processed in columns_json order below, so
    // a case column can reference a compute column declared just before
    // it — but never a later one, avoiding forward-reference cycles). No
    // auto-injection (unlike the FK-injection above): a derived column
    // reuses whatever the report ALSO chose to display, so it always
    // references real, visible values — never something pulled in behind
    // the scenes. ----
    const availableFields = new Set([
      ...explicitlySelectedBaseColumns,
      ...computedAliases,
      ...relationColumns.map((c) => `${c.relKey}.${c.relColKey}`),
      ...nestedRelationColumns.map((c) => `${c.relKey}.${c.subRelKey}.${c.subColKey}`),
    ]);
    const requireAvailable = (fieldName, aliasBeingDefined) => {
      if (!availableFields.has(fieldName)) {
        throw new Error(`Derived column "${aliasBeingDefined}" references "${fieldName}", which isn't selected on this report`);
      }
    };
    const requireAvailableIfRef = (value, aliasBeingDefined) => {
      if (value && typeof value === "object" && "ref" in value) requireAvailable(value.ref, aliasBeingDefined);
    };
    for (const spec of derivedSpecs) {
      if (spec.kind === "compute") {
        requireAvailable(spec.left, spec.alias);
        requireAvailable(spec.right, spec.alias);
      } else {
        // case
        for (const branch of spec.branches) {
          for (const cond of branch.when) {
            requireAvailable(cond.field, spec.alias);
            requireAvailableIfRef(cond.value, spec.alias);
          }
          requireAvailableIfRef(branch.then, spec.alias);
          if (branch.then && typeof branch.then === "object" && branch.then.compute) {
            requireAvailable(branch.then.compute.left, spec.alias);
            requireAvailable(branch.then.compute.right, spec.alias);
          }
        }
        requireAvailableIfRef(spec.else, spec.alias);
        if (spec.else && typeof spec.else === "object" && spec.else.compute) {
          requireAvailable(spec.else.compute.left, spec.alias);
          requireAvailable(spec.else.compute.right, spec.alias);
        }
      }
      availableFields.add(spec.alias);
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
    // Blank-aware / multi-value-OR clauses — a recurring shape across
    // allContactReportServices.js (labels, status, source type),
    // teamAllTaskReportServices.js (status/external_status/assigned team
    // member), accountReportServices.js (selectedPaymentBy): a list of ids
    // OR'd together (findInSet for CSV columns, plain IN for scalar ones),
    // PLUS an optional "no value set at all" sentinel (NULL/0/'') OR'd in.
    // Kept separate from userWhere (can't merge an Op.or fragment into that
    // flat object without colliding when more than one column needs one —
    // Op.or is the same Symbol key every time) and merged into the final
    // where the same way csvWhereClauses already are. ----
    const blankAwareWhereClauses = [];
    const inboundFilterSpecs = []; // {column, childFilters} — resolved after this loop, needs an await
    // Relation filters — "base rows whose JOINED row matches" (e.g. carts
    // whose customer.referance_contact = X — the normal SQL "join then
    // WHERE on the joined table" pattern relations don't support otherwise,
    // v1 having scoped them display-only). Mirror of inboundFilters but
    // outbound: an ALREADY-declared relation (registryEntry.relations[key]),
    // filtered by conditions validated against ITS target's own column
    // whitelist — reuses the full registered model's columns when the
    // relation names one via modelKey (no second whitelist to maintain,
    // same reasoning inboundFilters' childModelKey already uses), else
    // falls back to the relation's own curated display columns (which have
    // no filterable flags set, so those effectively can't be filtered on
    // until either promoted or the relation gains a modelKey — a safe
    // default, not silently permissive). Discriminated by relationFilters
    // (array) — a separate namespace from real columns, no collision risk,
    // same convention childFilters/having already use.
    const relationFilterSpecs = []; // {relKey, relDef, relationFilters}
    // Having filters — "keep only rows where the COMPUTED value matches",
    // e.g. productInventoryReportServices' stockTypeId bucket (zero-stock /
    // below-min-alert / above-max), which filters the computed closing
    // qty, not any stored column. Discriminated by f.having:true (a
    // separate namespace from effectiveColumns, same "no collision risk"
    // reasoning inboundFilters' childFilters discriminator already uses)
    // and by the target actually being a computedAliases entry — never a
    // raw column, that's what the plain filter branch below is for.
    // Applied as a uniform JS post-filter on the already-built `rows` array
    // (below, after grouping/running-total) rather than a SQL HAVING clause
    // — one code path regardless of which branch produced the computed
    // value (SQL group, CSV group, or running total), all already end up
    // as a plain JS array here, same reasoning CSV group-by's own
    // aggregation-in-JS already established.
    const havingSpecs = []; // {alias, op, value}
    for (const f of filters) {
      if (Array.isArray(f.relationFilters)) {
        const relDef = registryEntry.relations && registryEntry.relations[f.column];
        if (!relDef) throw new Error(`Relation "${f.column}" is not whitelisted for this report source`);
        if (relDef.matchMode) throw new Error(`Relation "${f.column}" does not support relation filters (csv/reverse relations aren't supported yet)`);
        relationFilterSpecs.push({ relKey: f.column, relDef, relationFilters: f.relationFilters });
        continue;
      }
      if (f.relationRequired) {
        const relDef = registryEntry.relations && registryEntry.relations[f.column];
        if (!relDef) throw new Error(`Relation "${f.column}" is not whitelisted for this report source`);
        if (relDef.matchMode) throw new Error(`Relation "${f.column}" does not support a relation-required filter (csv/reverse relations aren't supported yet)`);
        continue; // enforced during relation resolution below, using relationRequiredKeys
      }
      if (f.having) {
        if (!computedAliases.has(f.column)) {
          throw new Error(`"${f.column}" is not a computed value on this report (having filters only target an aggregate or running-total alias)`);
        }
        const operator = ALLOWED_OPERATORS[f.op || "eq"];
        if (!operator || f.op === "like") throw new Error(`Operator "${f.op}" is not allowed on a having filter`);
        havingSpecs.push({ alias: f.column, op: f.op || "eq", value: f.value });
        continue;
      }
      // Inbound filter — "base rows with a matching child row" (e.g.
      // "contacts who ordered product X"), discriminated by the presence of
      // childFilters (a separate namespace from effectiveColumns, so no
      // collision risk with a real column of the same key). Confirmed real
      // shape by reading allContactReportServices.js: filters cart_items by
      // cart_type + item_product_id, collects distinct contact_master_id,
      // then WHERE id IN (...) on the base query — resolved below, same
      // two-query pattern this codebase already uses everywhere else.
      if (Array.isArray(f.childFilters)) {
        const inboundDef = registryEntry.inboundFilters && registryEntry.inboundFilters[f.column];
        if (!inboundDef) throw new Error(`Inbound filter "${f.column}" is not whitelisted for this report source`);
        inboundFilterSpecs.push({ inboundDef, childFilters: f.childFilters });
        continue;
      }
      const columnDef = effectiveColumns[f.column];
      if (columnDef && columnDef.type === "csv") {
        if (!columnDef.filterable) throw new Error(`Column "${f.column}" is not filterable`);
        if (f.op !== "findInSet") throw new Error(`Operator "${f.op}" is not allowed on CSV column "${f.column}"`);
        if (Array.isArray(f.value)) {
          // Multi-value CSV filter — e.g. contacts.lable matching ANY (or
          // ALL, via combinator:"and") of several ids, optionally with a
          // "no labels set at all" blank sentinel OR'd in.
          const idClauses = f.value.map((v) => sequelizeWhere(fn("FIND_IN_SET", String(v), col(f.column)), { [Op.gt]: 0 }));
          const combined = idClauses.length === 0 ? null : f.combinator === "and" ? { [Op.and]: idClauses } : { [Op.or]: idClauses };
          if (f.includeBlank) {
            const blankClause = { [f.column]: { [Op.or]: [{ [Op.is]: null }, { [Op.eq]: "" }] } };
            blankAwareWhereClauses.push(combined ? { [Op.or]: [combined, blankClause] } : blankClause);
          } else if (combined) {
            blankAwareWhereClauses.push(combined);
          }
        } else {
          csvWhereClauses.push(sequelizeWhere(fn("FIND_IN_SET", String(f.value), col(f.column)), { [Op.gt]: 0 }));
        }
        continue;
      }
      if (Array.isArray(f.value) && f.includeBlank) {
        // Multi-value IN filter on a plain scalar column, OR'd with a "no
        // value set at all" sentinel — e.g. allContactReportServices.js's
        // status/source-type filters (a list of ids plus a blank bucket).
        // Plain multi-value WITHOUT includeBlank already works via the
        // existing {op:"in", value:[...]} path below, unchanged.
        if (!columnDef || !columnDef.filterable) throw new Error(`Column "${f.column}" is not filterable`);
        const orConditions = [];
        if (f.value.length > 0) orConditions.push({ [f.column]: { [Op.in]: f.value } });
        orConditions.push({ [f.column]: { [Op.is]: null } }, { [f.column]: { [Op.eq]: 0 } }, { [f.column]: { [Op.eq]: "" } });
        blankAwareWhereClauses.push({ [Op.or]: orConditions });
        continue;
      }
      Object.assign(userWhere, buildFilterCondition(columnDef, f.column, f));
    }

    // ---- Resolve inbound filters — one query per filter against the
    // ALREADY-REGISTERED child table (reusing its own column whitelist for
    // childFilters validation, not a duplicate whitelist), collecting
    // distinct parent ids. [0] sentinel on empty match (never a real id) —
    // same convention allContactReportServices.js itself uses, avoids a
    // malformed empty Op.in. ----
    for (const { inboundDef, childFilters } of inboundFilterSpecs) {
      const childRegistryEntry = getRegisteredModel(inboundDef.childModelKey);
      if (!childRegistryEntry) throw new Error(`Inbound filter child table "${inboundDef.childModelKey}" is not registered`);
      const childWhere = { isDelete: 0 };
      for (const cf of childFilters) {
        const childColumnDef = childRegistryEntry.columns[cf.column];
        Object.assign(childWhere, buildFilterCondition(childColumnDef, cf.column, cf));
      }
      const ChildModel = childRegistryEntry.getModel(req.tenantDB);
      const matchedChildRows = await ChildModel.findAll({
        where: childWhere,
        attributes: [inboundDef.childForeignKey],
        group: [inboundDef.childForeignKey],
        raw: true,
      });
      const parentIds = matchedChildRows.map((r) => r[inboundDef.childForeignKey]).filter((v) => v !== null && v !== undefined);
      userWhere[inboundDef.parentKey] = { [Op.in]: parentIds.length > 0 ? parentIds : [0] };
    }

    // ---- Resolve relation filters — one query per filter against the
    // relation's TARGET table (reusing the full registered model's own
    // column whitelist via modelKey when declared, else the relation's own
    // curated columns — same "no duplicate whitelist" reasoning as inbound
    // filters above), collecting matching target ids, then narrowing the
    // base query by its foreignKey IN (...). [0] sentinel on empty match,
    // same convention as inbound filters. ----
    for (const { relKey, relDef, relationFilters } of relationFilterSpecs) {
      const targetColumns = relDef.modelKey ? getRegisteredModel(relDef.modelKey)?.columns : relDef.columns;
      if (!targetColumns) throw new Error(`Relation "${relKey}" does not support filtering`);
      const relWhere = { isDelete: 0 };
      for (const rf of relationFilters) {
        const targetColumnDef = targetColumns[rf.column];
        Object.assign(relWhere, buildFilterCondition(targetColumnDef, rf.column, rf));
      }
      const RelatedModel = relDef.getModel(req.tenantDB);
      const matchedRelatedRows = await RelatedModel.findAll({
        where: relWhere,
        attributes: [relDef.targetKey],
        raw: true,
      });
      const matchedIds = matchedRelatedRows.map((r) => r[relDef.targetKey]).filter((v) => v !== null && v !== undefined);
      userWhere[relDef.foreignKey] = { [Op.in]: matchedIds.length > 0 ? matchedIds : [0] };
    }

    // ---- rights-based scope — fail closed, never fall back to unscoped ----
    let rightsWhere = {};
    if (scope === "all") {
      rightsWhere = { company_masters_id: resolvedCompanyId };
    } else if (scope === "own") {
      rightsWhere = { company_masters_id: resolvedCompanyId, a_application_login_id };
    } else if (scope === "chain") {
      rightsWhere = await buildChainWhere({
        model_key: definition.model_key,
        tenantDB: req.tenantDB,
        company_masters_id: resolvedCompanyId,
        a_application_login_id,
      });
    } else {
      return resError({ ack_msg: "No access to this report", developer_msg: "No report_definition_team_rights grant for this login on this report" });
    }

    // ---- free-text search — deliberately narrower than the legacy
    // globalSearch convention (inquiryReportServices.js etc.), which
    // introspects a model's raw Sequelize attributes and LIKEs every
    // STRING/TEXT/CHAR/VARCHAR column, whitelisted or not. This engine
    // never references a column that isn't already in effectiveColumns —
    // search is no exception, scoped to this report's own already-
    // whitelisted `type: "string"` columns only. Relation columns and
    // aggregate aliases are excluded (not real base-table columns to LIKE
    // against). ----
    const searchTerm = typeof req.body?.search === "string" ? req.body.search.trim() : "";
    const searchClauses = [];
    if (searchTerm) {
      const searchableColumns = Object.entries(effectiveColumns)
        .filter(([, def]) => def.type === "string")
        .map(([key]) => key);
      if (searchableColumns.length > 0) {
        searchClauses.push({
          [Op.or]: searchableColumns.map((key) => ({ [key]: { [Op.like]: `%${searchTerm}%` } })),
        });
      }
    }

    // ---- tenant/company scope injected LAST so a filter can never override it ----
    const baseWhere = {
      ...userWhere,
      ...rightsWhere,
      isDelete: 0,
    };
    // csvWhereClauses (sequelize.where(fn(...)) instances) and
    // blankAwareWhereClauses (Op.or fragments) can't merge into a plain
    // object the way {col: {op: val}} fragments can — combined via Op.and
    // instead. Flat shape (unchanged from before) when there are none.
    const extraWhereClauses = [...csvWhereClauses, ...blankAwareWhereClauses, ...searchClauses];
    const where = extraWhereClauses.length > 0 ? { [Op.and]: [baseWhere, ...extraWhereClauses] } : baseWhere;

    const requestedLimit = Number(req.body.limit) || DEFAULT_ROW_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), HARD_ROW_LIMIT);
    const offset = Number(req.body.offset) || 0;

    // ---- sort — validated the same way every other reference in this
    // engine is: a plain base column must be tagged sortable:true in
    // effectiveColumns (relation columns are select/display-only, never
    // sortable, same rule they already have everywhere else here), or it
    // must be one of THIS request's own computed aliases (an aggregate,
    // running-total, or compute/case column) — never an arbitrary string.
    // Also fixes a correctness bug, not just a UI nicety: without SOME
    // deterministic ORDER BY, offset-based paging has no guaranteed row
    // order between two calls to the same "unsorted" query — a scrolling
    // grid could silently see the same row twice or skip one. Defaulting
    // to `id ASC` when nothing is requested is what actually closes that,
    // independent of whether the caller ever sends `sort` at all. ----
    let sortSpec = null;
    const rawSort = req.body.sort;
    if (rawSort && typeof rawSort === "object" && typeof rawSort.column === "string") {
      // When GROUP BY is active, a plain base column is only a valid ORDER
      // BY target if it's also one of the grouped columns — MySQL's
      // ONLY_FULL_GROUP_BY would otherwise reject an ungrouped, non-
      // aggregated column in ORDER BY the same way it already would in
      // SELECT. No such restriction when there's no grouping at all.
      const isSortableBase =
        effectiveColumns[rawSort.column]?.sortable === true &&
        (sqlGroupColumns.length === 0 || sqlGroupColumns.includes(rawSort.column));
      const isComputedAlias = computedAliases.has(rawSort.column);
      if (isSortableBase || isComputedAlias) {
        sortSpec = { column: rawSort.column, direction: String(rawSort.direction).toUpperCase() === "DESC" ? "DESC" : "ASC" };
      }
      // An invalid/unrecognized sort column is silently ignored (falls
      // through to the default order below) rather than erroring the whole
      // request — same "don't fail an otherwise-valid run over one bad
      // optional param" leniency runtimeFilters already has.
    }

    const Model = registryEntry.getModel(req.tenantDB);

    const timeoutGuard = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Report query timed out")), QUERY_TIMEOUT_MS),
    );

    let rows;
    if (csvGroupColumn) {
      // ---- CSV group-by: fetch raw (ungrouped) rows — bounded by the same
      // HARD_ROW_LIMIT/DEFAULT_ROW_LIMIT ceiling as every other query here,
      // just applied to the pre-aggregation row count instead of the post-
      // aggregation group count (group counts are typically small: a
      // handful of statuses/labels, not thousands) — then split each row's
      // CSV value and accumulate aggregates per individual id in JS. Same
      // "manual expansion, not SQL" convention this codebase's own
      // statusWiseReportServices.js/lableWiseReportServices.js already
      // hand-roll for this exact problem, generalized here. ----
      const rawRows = await Promise.race([
        Model.findAll({
          attributes: [...rawFetchColumns],
          where,
          // Default order only here — the CSV-group branch re-buckets rows
          // in JS after this fetch (splitting the CSV column, aggregating
          // per id), so a user-chosen `sort` on a display column wouldn't
          // map onto the final grouped rows anyway. Still needs a
          // deterministic order for the same offset-pagination-correctness
          // reason every branch does, hence the plain id default.
          order: [["id", "ASC"]],
          limit,
          offset,
          raw: true,
        }),
        timeoutGuard,
      ]);

      const groupsMap = new Map();
      for (const row of rawRows) {
        const ids = splitCsv(row[csvGroupColumn]);
        for (const id of ids) {
          const dims = Object.fromEntries(sqlGroupColumns.map((g) => [g, row[g]]));
          const key = JSON.stringify([id, dims]);
          if (!groupsMap.has(key)) {
            groupsMap.set(key, { [csvGroupColumn]: id, dims, agg: {} });
          }
          const bucket = groupsMap.get(key);
          for (const spec of aggregateSpecs) {
            if (!bucket.agg[spec.alias]) bucket.agg[spec.alias] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
            const acc = bucket.agg[spec.alias];
            if (spec.aggregate === "count") {
              acc.sum += 1; // count reuses sum as the running total
            } else {
              const val = Number(row[spec.column]) || 0;
              acc.sum += val;
              acc.min = Math.min(acc.min, val);
              acc.max = Math.max(acc.max, val);
            }
            acc.count += 1;
          }
        }
      }

      rows = [...groupsMap.values()].map((bucket) => {
        const finalized = { [csvGroupColumn]: bucket[csvGroupColumn], ...bucket.dims };
        for (const spec of aggregateSpecs) {
          const acc = bucket.agg[spec.alias] || { sum: 0, count: 0, min: 0, max: 0 };
          finalized[spec.alias] =
            spec.aggregate === "avg" ? (acc.count ? acc.sum / acc.count : 0) : spec.aggregate === "min" ? (acc.count ? acc.min : 0) : spec.aggregate === "max" ? (acc.count ? acc.max : 0) : acc.sum; // sum and count both accumulate into acc.sum above
        }
        return finalized;
      });
    } else {
      rows = await Promise.race([
        Model.findAll({
          attributes: attributes.length ? attributes : undefined,
          where,
          group: sqlGroupColumns.length ? sqlGroupColumns : undefined,
          // runningTotalSpec's own order wins outright (the cumulative sum
          // below depends on rows arriving in that exact order) — otherwise
          // the caller's validated sort, or a deterministic default so
          // offset pagination is stable even when nobody asked for a sort.
          // The default can't just be `id` when GROUP BY is active — `id`
          // isn't one of the grouped columns, and MySQL's ONLY_FULL_GROUP_BY
          // would reject ordering by it the same way it would in SELECT —
          // so the default there is the first grouped column instead.
          order: runningTotalSpec
            ? [[runningTotalSpec.orderBy, "ASC"], ["id", "ASC"]]
            : sortSpec
              ? [[sortSpec.column, sortSpec.direction]]
              : sqlGroupColumns.length > 0
                ? [[sqlGroupColumns[0], "ASC"]]
                : [["id", "ASC"]],
          limit,
          offset,
          raw: true,
        }),
        timeoutGuard,
      ]);

      // ---- Cumulative sum per partition, over rows already fetched in
      // orderBy order — plain JS accumulation, not a SQL window function
      // (see comment at runningTotalSpec's declaration above). Resets to 0
      // for each distinct partitionBy value; a row with a null partition
      // value accumulates under its own "null" bucket rather than being
      // dropped. ----
      if (runningTotalSpec) {
        const running = new Map(); // partition value -> running sum so far
        for (const row of rows) {
          const key = row[runningTotalSpec.partitionBy];
          const prev = running.get(key) || 0;
          const next = prev + (Number(row[runningTotalSpec.column]) || 0);
          running.set(key, next);
          row[runningTotalSpec.alias] = next;
        }
      }
    }

    // ---- Having filters — applied here, uniformly, regardless of which
    // branch above produced `rows` (SQL group, CSV group, or running
    // total) since all three already end up as a plain JS array by this
    // point. Filters on the group/product count, not the underlying row
    // count, so it runs before limit/offset would otherwise be meaningful
    // for it — same "computed value" semantics a SQL HAVING clause has. ----
    if (havingSpecs.length > 0) {
      rows = rows.filter((row) => havingSpecs.every((spec) => evaluateHavingOperator(spec.op, row[spec.alias], spec.value)));
    }

    // ---- Whitelisted relations — one batched query per relation + a JS
    // Map merge, matching this codebase's own existing join convention
    // (see customerSalesPurchaseReportServices.js) rather than a Sequelize
    // `include` (no association is declared anywhere in this codebase).
    // Skipped entirely when there are no rows or no relation columns were
    // requested — never fires a query with an empty Op.in. ----
    if (rows.length > 0) {
      for (const relKey of usedRelationKeys) {
        const relDef = registryEntry.relations[relKey];
        const relTargetColumns = resolveRelationColumns(relDef);
        const relColKeys = relationColumns.filter((c) => c.relKey === relKey).map((c) => c.relColKey);
        // Nested (two-hop) entries chained off THIS relKey — only ever
        // present when relDef is a plain scalar relation (enforced at parse
        // time above), so these never combine with isCsv/isReverse below.
        const nestedEntries = nestedRelationColumns.filter((c) => c.relKey === relKey);
        const nestedFkKeys = [...new Set(nestedEntries.map((c) => c.subRelDef.foreignKey))];
        const isCsv = relDef.matchMode === "csv";
        // "reverse" — one-to-many, e.g. contacts.children (a self-relation:
        // this row's own id -> OTHER rows' referance_contact pointing back
        // at it). Confirmed real, shallow (one level, not deep recursion)
        // shape by reading chainContactReportService.js. foreignKey is this
        // row's own linking column (usually "id"); targetKey is the CHILD
        // table's column that points back — same field NAMES as the
        // one-to-one case above, just matched in the opposite direction.
        const isReverse = relDef.matchMode === "reverse";

        // csv: each row's FK column is "3,7,12" — split every row's value
        // and flatten into one distinct id set for a single batched fetch
        // (never split-then-fetch-per-row — same "one query, not N+1" rule
        // as the scalar/reverse cases).
        const distinctFkValues = isCsv
          ? [...new Set(rows.flatMap((r) => splitCsv(r[relDef.foreignKey])))]
          : [...new Set(rows.map((r) => r[relDef.foreignKey]).filter((v) => v !== null && v !== undefined))];

        const relMap = new Map();
        if (distinctFkValues.length > 0) {
          const RelatedModel = relDef.getModel(req.tenantDB);
          // "reverse" needs every matching child row (to join/count all of
          // them per parent), not one row per targetKey value — fetched
          // ungrouped, grouped into arrays in JS below instead.
          const nonCountRelColKeys = isReverse ? relColKeys.filter((k) => !relTargetColumns[k].countOf) : relColKeys;
          const relatedRows = await RelatedModel.findAll({
            where: { [relDef.targetKey]: { [Op.in]: distinctFkValues }, isDelete: 0 },
            // nestedFkKeys are fetched even though never displayed directly —
            // they're the join key for the second-hop fetch below.
            attributes: [relDef.targetKey, ...nonCountRelColKeys, ...nestedFkKeys],
            raw: true,
          });
          if (isReverse) {
            relatedRows.forEach((rr) => {
              const key = rr[relDef.targetKey];
              if (!relMap.has(key)) relMap.set(key, []);
              relMap.get(key).push(rr);
            });
          } else {
            relatedRows.forEach((rr) => relMap.set(rr[relDef.targetKey], rr));
          }
        }

        // Relation-required — drop rows whose relation lookup found nothing
        // (e.g. the target was soft-deleted, so it never made it into relMap
        // above, which already scopes to isDelete:0). Applied here, right
        // after relMap is built and before the display merge below, so a
        // later relKey's own relMap fetch (if any) only has to consider the
        // rows that survived this one.
        if (relationRequiredKeys.has(relKey)) {
          rows = rows.filter((r) => relMap.has(r[relDef.foreignKey]));
        }

        // ---- Second hop — one more batched fetch per distinct subRelKey,
        // keyed off the level-1 related rows already sitting in relMap
        // (never off the base rows directly). relDef here is guaranteed
        // scalar (non-csv, non-reverse), enforced at parse time, so relMap
        // values are plain objects, not arrays. ----
        const nestedGroups = new Map(); // subRelKey -> {subRelDef, subColKeys}
        nestedEntries.forEach(({ subRelKey, subRelDef, subColKey }) => {
          if (!nestedGroups.has(subRelKey)) nestedGroups.set(subRelKey, { subRelDef, subColKeys: [] });
          nestedGroups.get(subRelKey).subColKeys.push(subColKey);
        });
        const subRelMaps = new Map(); // subRelKey -> Map(targetKey -> row)
        for (const [subRelKey, { subRelDef, subColKeys }] of nestedGroups) {
          const isSubCsv = subRelDef.matchMode === "csv";
          const distinctSubFkValues = isSubCsv
            ? [...new Set([...relMap.values()].flatMap((rr) => splitCsv(rr[subRelDef.foreignKey])))]
            : [...new Set([...relMap.values()].map((rr) => rr[subRelDef.foreignKey]).filter((v) => v !== null && v !== undefined))];
          const subRelMap = new Map();
          if (distinctSubFkValues.length > 0) {
            const SubRelatedModel = subRelDef.getModel(req.tenantDB);
            const subRelatedRows = await SubRelatedModel.findAll({
              where: { [subRelDef.targetKey]: { [Op.in]: distinctSubFkValues }, isDelete: 0 },
              attributes: [subRelDef.targetKey, ...subColKeys],
              raw: true,
            });
            subRelatedRows.forEach((rr) => subRelMap.set(rr[subRelDef.targetKey], rr));
          }
          subRelMaps.set(subRelKey, subRelMap);
        }

        rows.forEach((r) => {
          if (isReverse) {
            const children = relMap.get(r[relDef.foreignKey]) || [];
            relColKeys.forEach((relColKey) => {
              r[`${relKey}.${relColKey}`] = relTargetColumns[relColKey].countOf
                ? children.length
                : children
                    .map((c) => c[relColKey])
                    .filter((v) => v !== undefined && v !== null && v !== "")
                    .join(", ");
            });
          } else if (isCsv) {
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
            nestedEntries.forEach(({ subRelKey, subRelDef, subColKey }) => {
              const outKey = `${relKey}.${subRelKey}.${subColKey}`;
              if (!relatedRow) {
                r[outKey] = null;
                return;
              }
              const subRelMap = subRelMaps.get(subRelKey);
              if (subRelDef.matchMode === "csv") {
                const subIds = splitCsv(relatedRow[subRelDef.foreignKey]);
                r[outKey] = subIds
                  .map((id) => subRelMap.get(id)?.[subColKey])
                  .filter((v) => v !== undefined && v !== null)
                  .join(", ");
              } else {
                const subRow = subRelMap.get(relatedRow[subRelDef.foreignKey]);
                r[outKey] = subRow ? subRow[subColKey] ?? null : null;
              }
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

    // ---- Computed columns — plain JS arithmetic between two values now
    // present on every row (an aggregate/running-total alias and/or a
    // relation column, both validated against availableFields above).
    // Runs last, after relation merge, since a relation-referencing operand
    // (e.g. product.purchase_rate) only lands on the row during that step.
    // Processed in columns_json order (derivedSpecs), so a case column can
    // read an earlier compute column's result on the SAME row within this
    // same pass — no second pass needed, each row is independent. ----
    if (derivedSpecs.length > 0) {
      rows.forEach((r) => {
        derivedSpecs.forEach((spec) => {
          r[spec.alias] = spec.kind === "compute" ? COMPUTE_OPS[spec.op](Number(r[spec.left]) || 0, Number(r[spec.right]) || 0) : evaluateCaseSpec(r, spec);
        });
      });
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
