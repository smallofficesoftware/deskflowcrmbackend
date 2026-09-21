/**
 * Migration Name: migrate-report-group-to-category
 * Database Type: TENANT
 *
 * Data migration for 20260916130000-add-category-to-report-definitions.js.
 * Best-effort: a report whose old report_groups.group_name matches (case-
 * insensitively) one of the fixed category names gets that category;
 * every other report (no group, or a custom group name that doesn't match
 * a fixed category) falls back to "Others" — there's no reliable way to
 * map an arbitrary tenant-typed group name ("Sales Team", "Q1 Reports",
 * ...) onto the fixed taxonomy, so this doesn't try to guess further.
 */

const FIXED_CATEGORIES = [
  "CompanySetup",
  "HR",
  "Activities",
  "CRM",
  "HRMS",
  "Production",
  "Account",
  "Automation",
  "Settings",
  "Masters",
  "Product Settings",
  "Others",
  "new reports",
  "Inventory",
  "CS",
];

export const up = async (queryInterface) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.report_group_id || !table.category) return;

  for (const category of FIXED_CATEGORIES) {
    await queryInterface.sequelize.query(
      `UPDATE report_definitions rd
       JOIN report_groups rg ON rg.id = rd.report_group_id
       SET rd.category = :category
       WHERE LOWER(rg.group_name) = LOWER(:category) AND rd.category IS NULL`,
      { replacements: { category } },
    );
  }

  await queryInterface.sequelize.query(
    `UPDATE report_definitions SET category = 'Others' WHERE category IS NULL`,
  );
};

export const down = async () => {
  // Data migration only — no reverse mapping back to report_group_id.
};
