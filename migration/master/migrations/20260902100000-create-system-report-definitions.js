/**
 * Migration Name: create-system-report-definitions
 * Database Type: MASTER
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("system_report_definitions", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: Sequelize.STRING,
    },
    type: {
      type: Sequelize.STRING,
      defaultValue: "query",
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
    filters_to_show: {
      type: Sequelize.TEXT,
    },
    category: {
      type: Sequelize.STRING,
    },
    description: {
      type: Sequelize.TEXT,
    },
    priority: {
      type: Sequelize.ENUM("critical", "high", "normal"),
    },
    display_order: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    isActive: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
    created_date_time: {
      type: Sequelize.DATE,
    },
  });

  await queryInterface.addIndex("system_report_definitions", {
    fields: ["category"],
    name: "idx_system_report_definitions_category",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("system_report_definitions");
};
