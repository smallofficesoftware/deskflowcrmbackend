/**
 * Migration Name: create-report-definitions
 * Database Type: TENANT
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("report_definitions", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
    },
    name: {
      type: Sequelize.STRING,
    },
    type: {
      type: Sequelize.STRING,
      defaultValue: "query",
    },
    page_id: {
      type: Sequelize.INTEGER,
    },
    model_key: {
      type: Sequelize.STRING,
    },
    plugin_key: {
      type: Sequelize.STRING,
    },
    columns_json: {
      type: Sequelize.TEXT,
    },
    filters_json: {
      type: Sequelize.TEXT,
    },
    group_by_json: {
      type: Sequelize.TEXT,
    },
    created_date_time: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    modified_date: {
      type: Sequelize.DATE,
    },
    s_timestemp: {
      type: Sequelize.STRING,
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

  await queryInterface.addIndex("report_definitions", {
    fields: ["company_masters_id", "isDelete"],
    name: "idx_report_definitions_company",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("report_definitions");
};
