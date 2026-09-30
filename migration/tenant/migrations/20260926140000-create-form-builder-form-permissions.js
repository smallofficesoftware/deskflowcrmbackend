/**
 * Migration Name: create-form-builder-form-permissions
 * Database Type: TENANT
 *
 * Form Builder v2 per-form "Permissions" tab (plan section 3/7): which
 * users (a_application_login_id) or teams (team_id = departments.id) of a
 * form may change dates, override the auto number, see masked fields,
 * import Excel, manage schedules, edit completed submissions, or convert.
 * One row per (form, permission_key, user-or-team); exactly one of
 * a_application_login_id / team_id is set. Removal is a soft delete.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_form_permissions", {
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
    permission_key: {
      type: Sequelize.STRING(50),
      allowNull: false,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    team_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 1,
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    modified_date: {
      type: Sequelize.DATE,
      allowNull: true,
    },
  });

  await queryInterface.addIndex("form_builder_form_permissions", {
    fields: ["form_id", "permission_key"],
    name: "idx_form_builder_form_permissions_form_key",
  });
  await queryInterface.addIndex("form_builder_form_permissions", {
    fields: ["a_application_login_id"],
    name: "idx_form_builder_form_permissions_login",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_form_permissions");
};
