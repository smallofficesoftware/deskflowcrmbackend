/**
 * Migration Name: drop-form-builder-templates
 * Database Type: TENANT
 *
 * Form Builder "Save as template" / "Start from a template" and the built-in
 * starter forms were removed (Duplicate on the forms list covers it), so the
 * company templates table is no longer used. Created by
 * 20260926180000-create-form-builder-templates.js.
 *
 * Idempotent: a tenant that never had the table is left alone.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP TABLE IF EXISTS `form_builder_templates`");
};

// Recreates the empty table as it was (the saved templates themselves are not restored).
export const down = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_templates", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    title: { type: Sequelize.STRING(150), allowNull: false },
    description: { type: Sequelize.STRING(500), allowNull: true },
    schema_json: { type: Sequelize.TEXT("long"), allowNull: false },
    settings_json: { type: Sequelize.TEXT("long"), allowNull: true },
    created_by_a_application_login_id: { type: Sequelize.INTEGER, allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false },
    isDelete: { type: Sequelize.TINYINT, defaultValue: 0 },
    isActive: { type: Sequelize.TINYINT, defaultValue: 1 },
  });
};
