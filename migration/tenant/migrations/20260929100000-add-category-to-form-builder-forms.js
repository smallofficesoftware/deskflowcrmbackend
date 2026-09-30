/**
 * Migration Name: add-category-to-form-builder-forms
 * Database Type: TENANT
 *
 * Sidebar section a form's per-form row shows under (CRM, HRMS, Production,
 * ...) - same category taxonomy as Report Builder's report_definitions,
 * so a form sits in the sidebar the same way a custom report does. NULL
 * falls back to "Others" at render time (SideBarView.tsx), not here.
 */

const columnExists = async (queryInterface, table, column) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME = :column`,
    { replacements: { table, column } },
  );
  return Number(rows[0]?.c) > 0;
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface, "form_builder_forms", "category"))) {
    await queryInterface.addColumn("form_builder_forms", "category", {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "form_builder_forms", "category")) {
    await queryInterface.removeColumn("form_builder_forms", "category");
  }
};
