/**
 * Migration Name: add-form-builder-drafts
 * Database Type: TENANT
 *
 * "Save and continue later" (plan item M7): a person's half-filled form is
 * kept as a draft that only they can see, until they finish it (the draft is
 * then deleted) or throw it away. A draft is a plain JSON copy of what they
 * typed: it is not validated, takes no auto number and creates no entry.
 * Photos, files and signatures are not kept in a draft.
 */

export const up = async (queryInterface, Sequelize) => {
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

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_drafts");
};
