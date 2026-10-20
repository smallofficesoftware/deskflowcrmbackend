/**
 * Migration Name: add-variant-scope-to-custom-field-form-masters
 * Database Type: TENANT
 * Created: 20/10/2026
 *
 * plans/2026-10-20-product-variant-ui-and-field-scoping-plan.txt, Phase 1. Lets a custom
 * field (Settings > Custom Field Form) declare whether it applies to a variant Parent
 * template, a Variant row, or both - only meaningful for Product Master fields
 * (form_type 4), ignored elsewhere. Default 3 (Both) so every existing field keeps
 * showing exactly where it does today.
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
  if (!(await columnExists(queryInterface, "custom_field_form_masters", "variant_scope"))) {
    await queryInterface.addColumn("custom_field_form_masters", "variant_scope", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 3,
      comment: "1=Parent only, 2=Variant only, 3=Both (default) - Product Master fields only",
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "custom_field_form_masters", "variant_scope")) {
    await queryInterface.removeColumn("custom_field_form_masters", "variant_scope");
  }
};
