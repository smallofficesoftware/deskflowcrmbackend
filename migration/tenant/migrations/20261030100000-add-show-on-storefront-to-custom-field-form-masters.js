/**
 * Migration Name: add-show-on-storefront-to-custom-field-form-masters
 * Database Type: TENANT
 * Created: 30/10/2026
 *
 * Lets a Product Master custom field (form_type 4) be shown on the online store's product page, under
 * Specifications. Opt-in: default 2 (No), so no existing field - some are internal, like a rack number -
 * appears to customers until someone switches it on in Settings > Custom Field Form. 1 = Yes, 2 = No,
 * the same Yes/No values print_or_not and report_print_or_not use. Ignored for every other form type.
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
  if (!(await columnExists(queryInterface, "custom_field_form_masters", "show_on_storefront"))) {
    await queryInterface.addColumn("custom_field_form_masters", "show_on_storefront", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 2,
      comment: "1=Yes, 2=No (default) - show on the online store product page; Product Master fields only",
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "custom_field_form_masters", "show_on_storefront")) {
    await queryInterface.removeColumn("custom_field_form_masters", "show_on_storefront");
  }
};
