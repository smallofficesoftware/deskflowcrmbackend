/**
 * Migration Name: create-form-builder-form-team-rights
 * Database Type: TENANT
 *
 * Per-form (not per-page) grant, mirroring report_definition_team_rights:
 * which specific a_application_login_id is allowed to fill/see a specific
 * form_builder_forms row when that form's restrict_to_assigned_team=1.
 * submissions_scope controls whether the login sees only their own
 * submissions for that form, all of them, or none.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_form_team_rights", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    form_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    can_fill: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
    submissions_scope: {
      type: Sequelize.ENUM("none", "own", "all"),
      allowNull: false,
      defaultValue: "own",
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    isActive: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
  });

  await queryInterface.addIndex("form_builder_form_team_rights", {
    fields: ["form_id", "a_application_login_id"],
    unique: true,
    name: "uniq_form_builder_team_rights_form_login",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_form_team_rights");
};
