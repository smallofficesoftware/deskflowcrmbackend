/**
 * Migration Name: create-form-builder-templates
 * Database Type: TENANT
 *
 * Company templates for Form Builder (plan item L3): "Save as template" on any
 * form, then pick it from "New form". The built-in starter forms live in code
 * (formBuilderBuiltinTemplates.js), not in this table.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_templates", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    title: {
      type: Sequelize.STRING(150),
      allowNull: false,
    },
    description: {
      type: Sequelize.STRING(500),
      allowNull: true,
    },
    schema_json: {
      type: Sequelize.TEXT("long"),
      allowNull: false,
    },
    settings_json: {
      type: Sequelize.TEXT("long"),
      allowNull: true,
    },
    created_by_a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
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
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_templates");
};
