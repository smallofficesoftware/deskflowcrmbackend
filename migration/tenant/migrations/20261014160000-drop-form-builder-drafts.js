/**
 * Migration Name: drop-form-builder-drafts
 * Database Type: TENANT
 *
 * Form Builder "Save draft" on the fill screen (and the "My drafts" box) was
 * removed, so the per-person drafts table is no longer used. Created by
 * 20260926200000-add-form-builder-drafts.js.
 *
 * Idempotent: a tenant that never had the table is left alone.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP TABLE IF EXISTS `form_builder_drafts`");
};

// Recreates the empty table as it was (the drafts themselves are not restored).
export const down = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_drafts", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    form_id: { type: Sequelize.INTEGER, allowNull: false },
    a_application_login_id: { type: Sequelize.INTEGER, allowNull: false },
    answers_json: { type: Sequelize.TEXT("long"), allowNull: false },
    created_date_time: { type: Sequelize.DATE, allowNull: false },
    updated_date_time: { type: Sequelize.DATE, allowNull: false },
    isDelete: { type: Sequelize.TINYINT, defaultValue: 0 },
  });
  await queryInterface.addIndex("form_builder_drafts", {
    fields: ["a_application_login_id", "form_id", "isDelete"],
    name: "idx_form_builder_drafts_user",
  });
};
