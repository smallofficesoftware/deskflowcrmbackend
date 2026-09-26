// Pure SQL-string builder for form_builder's per-form dynamic tables
// (fbs_<form_id> / fbs_<form_id>_r<repeater_field_id>). No DB calls here —
// diffing against information_schema to decide what's actually missing is
// formBuilderService.js's job (see plan §1 "Publish failure / DDL
// recovery"); this file only turns a validated field list into SQL text.
//
// Security posture (plan §4 "Security note", load-bearing): every
// identifier this file emits comes from either a server-generated numeric
// form_id/repeater field id, or a field `key` that was validated against
// FIELD_KEY_PATTERN at the moment it was created in the builder — never
// free-text. Every identifier is additionally backtick-quoted as
// defense-in-depth beyond that validation (dodges reserved-word collisions
// like `order`/`group`/`key` chosen as a field key). This is the single
// choke point for building CREATE/ALTER SQL for form tables — no other
// file should hand-build this SQL.

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

// Fixed columns every fbs_<form_id>/repeater child table already has (see
// MAIN_TABLE_FIXED_COLUMNS_SQL and buildCreateRepeaterTableStatement below)
// plus MySQL/InnoDB reserved words that would otherwise need runtime
// backtick-quoting gymnastics. A field key colliding with one of these is
// rejected outright at validation time — not just backtick-quoted around —
// because several of these are server-controlled columns
// (isDelete/company_masters_id/related_record_id/submission_status_id/...):
// letting a field literally be named one of them would mean a submitted
// *value* for that field silently overwrites the real system column when
// createFormSubmission spreads validated answers over the fixed-column
// object (formBuilderSubmissionService.js's insertColumns).
const RESERVED_FIELD_KEYS = new Set([
  "id",
  "company_masters_id",
  "form_version",
  "submitted_by_type",
  "submitted_by_a_application_login_id",
  "submitter_name",
  "submitter_email",
  "submitter_phone",
  "related_module",
  "related_record_id",
  "possible_duplicate_contact_id",
  "submission_status_id",
  "last_edited_by_a_application_login_id",
  "last_edited_date_time",
  "source_ip",
  "current_stage",
  "stage_status",
  "is_draft",
  "consent_at",
  "consent_ip",
  "source",
  "campaign",
  "created_date_time",
  "modified_date",
  "isDelete",
  "isActive",
  "submission_id",
  "row_order",
]);

export function isValidFieldKey(key) {
  return (
    typeof key === "string" &&
    FIELD_KEY_PATTERN.test(key) &&
    !RESERVED_FIELD_KEYS.has(key) &&
    !RESERVED_FIELD_KEYS.has(key.toLowerCase())
  );
}

export function isValidFormId(formId) {
  return Number.isInteger(formId) && formId > 0;
}

function assertValidFormId(formId) {
  if (!isValidFormId(formId)) {
    throw new Error(`formBuilderDdlBuilder: invalid form id "${formId}"`);
  }
}

function assertValidFieldKey(key, label) {
  if (!isValidFieldKey(key)) {
    // VALIDATION: prefix matches formBuilderService.js's publishForm()
    // convention for user-facing validation failures (400 + friendly
    // message) vs. an unexpected DDL error (500 + generic message) — see
    // its catch block's isValidation check. Message is shown to the form
    // builder as-is, so it names the field by its label.
    const name = label ? `“${label}”` : `A field (key "${key}")`;
    throw new Error(
      `VALIDATION: ${name} has an internal name that can't be used ("${key}"). Use only small letters, numbers and _, start with a letter, and avoid system names like id or isDelete.`,
    );
  }
}

// Backtick-quote an identifier we've already validated is safe to use
// (numeric id or FIELD_KEY_PATTERN-matched key) — defense-in-depth, not the
// primary safety mechanism (that's the validation above).
function quoteIdent(name) {
  return `\`${name}\``;
}

export function mainTableName(formId) {
  assertValidFormId(formId);
  return `fbs_${formId}`;
}

export function repeaterTableName(formId, repeaterFieldId) {
  assertValidFormId(formId);
  if (!isValidFormId(repeaterFieldId)) {
    throw new Error(`formBuilderDdlBuilder: invalid repeater field id "${repeaterFieldId}"`);
  }
  return `fbs_${formId}_r${repeaterFieldId}`;
}

// Field type -> SQL column type, per plan §1's type table (+ Form Builder
// v2 Phase 1 types at the bottom). Types with no physical column
// (section-header/instruction, file/signature/image, repeater) are not
// in this map — callers must filter those out before calling
// columnTypeForField (columnDefinitionsForFields does this already).
const FIELD_TYPE_COLUMN_MAP = {
  text: "VARCHAR(255)",
  phone: "VARCHAR(255)",
  email: "VARCHAR(255)",
  url: "VARCHAR(255)",
  dropdown: "VARCHAR(255)",
  radio: "VARCHAR(255)",
  textarea: "TEXT",
  address: "TEXT",
  number: "DECIMAL(18,4)",
  rating: "DECIMAL(18,4)",
  date: "DATE",
  datetime: "DATETIME",
  checkbox: "TINYINT",
  switch: "TINYINT",
  "multi-select": "TEXT",
  reference: "INT",
  // v2 Phase 1. auto-number is server-owned (numbers assigned in Phase 4);
  // question-table holds the whole answer grid as JSON; calculation is
  // recomputed server-side in Phase 6; customer-lookup/user hold a
  // contact_masters / application login id.
  "auto-number": "VARCHAR(100)",
  "customer-lookup": "INT",
  "question-table": "LONGTEXT",
  calculation: "DECIMAL(18,4)",
  user: "INT",
  // v2 Phase 7: time of day, money (2 decimals), percentage, GPS "lat,lng",
  // and scanned / typed barcode text.
  time: "TIME",
  currency: "DECIMAL(18,2)",
  percentage: "DECIMAL(9,2)",
  location: "VARCHAR(60)",
  barcode: "VARCHAR(255)",
  // v2 Phase 11: "I agree to the terms" tick, linked to a terms block (M2).
  consent: "TINYINT",
};

// Shared field-type sets — imported by the submission, export and PDF code
// instead of each keeping its own hardcoded copy.
//
// Layout-only types: shown to the filler, never validated or stored.
export const LAYOUT_TYPES = new Set(["section-header", "instruction"]);
// Upload types: stored in form_builder_submission_files, not on the table.
export const FILE_TYPES = new Set(["file", "signature", "image"]);
// Every no-column type except repeater — for callers that handle repeater
// separately (Excel/PDF column lists, repeater sub-field lists).
export const NO_COLUMN_NON_REPEATER_TYPES = new Set([...LAYOUT_TYPES, ...FILE_TYPES]);
// Field types that never become a physical column on the dynamic table.
export const NO_COLUMN_TYPES = new Set([...NO_COLUMN_NON_REPEATER_TYPES, "repeater"]);
// Types whose value the server sets itself — any client-sent value is
// ignored (auto-number: Phase 4 assigns it; NULL until then).
export const SERVER_OWNED_TYPES = new Set(["auto-number"]);

export function columnTypeForField(field) {
  // A calculation that works out a date (due date = received + 7 days) is a DATE column.
  if (field.type === "calculation" && field.result_type === "date") return "DATE";
  const columnType = FIELD_TYPE_COLUMN_MAP[field.type];
  if (!columnType) {
    throw new Error(`formBuilderDdlBuilder: field type "${field.type}" has no column mapping`);
  }
  return columnType;
}

// Scalar (non-repeater, non-layout, non-file) fields from a field list,
// each validated and paired with its target SQL column type + index kind.
function columnDefinitionsForFields(fields) {
  return fields
    .filter((f) => !NO_COLUMN_TYPES.has(f.type))
    .map((f) => {
      assertValidFieldKey(f.key, f.label);
      return {
        key: f.key,
        columnType: columnTypeForField(f),
        // auto-number values must never repeat (plan B5) — always unique.
        unique: !!f.unique || f.type === "auto-number",
        filterable: !!f.filterable,
      };
    });
}

function columnClause({ key, columnType }) {
  return `${quoteIdent(key)} ${columnType} NULL`;
}

function indexClauses(columnDefs) {
  const clauses = [];
  for (const col of columnDefs) {
    if (col.unique) {
      clauses.push(`UNIQUE INDEX ${quoteIdent(`uniq_${col.key}`)} (${quoteIdent(col.key)})`);
    } else if (col.filterable) {
      clauses.push(`INDEX ${quoteIdent(`idx_${col.key}`)} (${quoteIdent(col.key)})`);
    }
  }
  return clauses;
}

// Fixed columns every fbs_<form_id> main table has, regardless of the
// form's own fields — plan §1's "Fixed columns (always present)" list.
const MAIN_TABLE_FIXED_COLUMNS_SQL = `
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`company_masters_id\` INT NOT NULL,
  \`form_version\` INT NULL DEFAULT NULL,
  \`submitted_by_type\` VARCHAR(20) NOT NULL,
  \`submitted_by_a_application_login_id\` INT NULL DEFAULT NULL,
  \`submitter_name\` VARCHAR(255) NULL DEFAULT NULL,
  \`submitter_email\` VARCHAR(255) NULL DEFAULT NULL,
  \`submitter_phone\` VARCHAR(50) NULL DEFAULT NULL,
  \`related_module\` VARCHAR(50) NULL DEFAULT NULL,
  \`related_record_id\` INT NULL DEFAULT NULL,
  \`possible_duplicate_contact_id\` INT NULL DEFAULT NULL,
  \`submission_status_id\` INT NULL DEFAULT NULL,
  \`last_edited_by_a_application_login_id\` INT NULL DEFAULT NULL,
  \`last_edited_date_time\` DATETIME NULL DEFAULT NULL,
  \`source_ip\` VARCHAR(64) NULL DEFAULT NULL,
  \`current_stage\` VARCHAR(20) NULL DEFAULT NULL,
  \`stage_status\` VARCHAR(20) NULL DEFAULT NULL,
  \`is_draft\` TINYINT NOT NULL DEFAULT 0,
  \`consent_at\` DATETIME NULL DEFAULT NULL,
  \`consent_ip\` VARCHAR(64) NULL DEFAULT NULL,
  \`source\` VARCHAR(100) NULL DEFAULT NULL,
  \`campaign\` VARCHAR(100) NULL DEFAULT NULL,
  \`created_date_time\` DATETIME NOT NULL,
  \`isDelete\` TINYINT NOT NULL DEFAULT 0,
  \`isActive\` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_company_isdelete_created\` (\`company_masters_id\`, \`isDelete\`, \`created_date_time\`),
  INDEX \`idx_possible_duplicate_contact\` (\`possible_duplicate_contact_id\`),
  INDEX \`idx_submission_status\` (\`submission_status_id\`),
  INDEX \`idx_stage\` (\`current_stage\`, \`stage_status\`),
  INDEX \`idx_draft\` (\`is_draft\`)`.trim();

// CREATE TABLE fbs_<form_id> — main table, first publish. All columns and
// their indexes declared inline in this one statement (plan §1's schema-
// evolution notes: fewer statements, fewer places a publish can fail
// partway).
export function buildCreateMainTableStatement(formId, fields) {
  const table = mainTableName(formId);
  const columnDefs = columnDefinitionsForFields(fields);
  const parts = [MAIN_TABLE_FIXED_COLUMNS_SQL];
  for (const col of columnDefs) {
    parts.push(columnClause(col));
  }
  parts.push(...indexClauses(columnDefs));
  return `CREATE TABLE ${quoteIdent(table)} (\n  ${parts.join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;`;
}

// CREATE TABLE fbs_<form_id>_r<repeaterFieldId> — one per repeater field.
// Fixed columns: id, submission_id (FK to the parent table, not enforced
// at the DB level — matches how this app's other tenant tables generally
// don't use InnoDB FKs), row_order. Sub-repeaters are not allowed (plan
// §1's 1-level-deep cap), so subFields is always a flat scalar list.
export function buildCreateRepeaterTableStatement(formId, repeaterFieldId, subFields) {
  const table = repeaterTableName(formId, repeaterFieldId);
  const columnDefs = columnDefinitionsForFields(subFields);
  const parts = [
    "`id` INT NOT NULL AUTO_INCREMENT",
    "`submission_id` INT NOT NULL",
    "`row_order` INT NOT NULL DEFAULT 0",
  ];
  for (const col of columnDefs) {
    parts.push(columnClause(col));
  }
  parts.push(...indexClauses(columnDefs));
  parts.push("PRIMARY KEY (`id`)");
  parts.push("INDEX `idx_submission_id` (`submission_id`)");
  return `CREATE TABLE ${quoteIdent(table)} (\n  ${parts.join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;`;
}

// ALTER TABLE <table> MODIFY COLUMN <key> <newType> — only ever called by
// formBuilderService.js's publish() when a field's `type` changed AND the
// table has zero submissions so far (plan §1's evolution rule: type
// changes are blocked once any submission exists, so there's never data to
// lose here). Batched into the same statement as any ADD COLUMNs in the
// same publish, for the same "fewer statements" reasoning.
export function buildAlterModifyColumnsStatement(tableName, changedFields) {
  const columnDefs = columnDefinitionsForFields(changedFields);
  if (columnDefs.length === 0) return null;
  const parts = columnDefs.map((col) => `MODIFY COLUMN ${columnClause(col)}`);
  return `ALTER TABLE ${quoteIdent(tableName)}\n  ${parts.join(",\n  ")};`;
}

// ALTER TABLE <table> ADD COLUMN a ..., ADD COLUMN b ... [, ADD INDEX ...] —
// one statement for every new field in a republish, batched (plan §1:
// atomic, avoids N separate metadata locks/binlog events). Returns null if
// there's nothing to add (caller should skip issuing an empty ALTER).
export function buildAlterAddColumnsStatement(tableName, newFields) {
  const columnDefs = columnDefinitionsForFields(newFields);
  if (columnDefs.length === 0) return null;

  const parts = columnDefs.map((col) => `ADD COLUMN ${columnClause(col)}`);
  for (const clause of indexClauses(columnDefs)) {
    parts.push(`ADD ${clause}`);
  }
  return `ALTER TABLE ${quoteIdent(tableName)}\n  ${parts.join(",\n  ")};`;
}
