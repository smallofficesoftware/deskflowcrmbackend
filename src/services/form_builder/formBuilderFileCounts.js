import { QueryTypes } from "sequelize";

// How many attachments each entry has per File / Image / Signature field, for
// the entries grid's paperclip column. The files themselves live in
// form_builder_submission_files (not in the entry's own row), so the grid
// would otherwise have nothing to show for them.
//
// Returns { <submission_id>: { <field_key>: <count> } } - only entries that
// have at least one file appear. One query for the whole page of entries.
export async function loadFileCounts({ tenantDB, form_id, submissionIds }) {
  const ids = [...new Set((submissionIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return {};

  const rows = await tenantDB.query(
    "SELECT submission_id, field_key, COUNT(*) AS n FROM `form_builder_submission_files` " +
      "WHERE form_id = :form_id AND isDelete = 0 AND submission_id IN (:ids) GROUP BY submission_id, field_key",
    { replacements: { form_id, ids }, type: QueryTypes.SELECT },
  );

  const counts = {};
  for (const r of rows) {
    (counts[r.submission_id] ||= {})[r.field_key] = Number(r.n) || 0;
  }
  return counts;
}

// A copy of an enriched row with its `_file_counts` filled in.
export function withFileCounts(row, countsBySubmission) {
  return { ...row, _file_counts: countsBySubmission?.[row.id] || {} };
}
