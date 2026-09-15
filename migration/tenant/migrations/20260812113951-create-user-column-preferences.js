/**
 * Migration Name: create-user-column-preferences
 * Database Type: TENANT
 */

export const up = async (queryInterface, Sequelize) => {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes("user_column_preferences")) {
    await queryInterface.createTable("user_column_preferences", {
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
      report_key: {
        type: Sequelize.STRING,
      },
      column_order: {
        type: Sequelize.TEXT,
      },
      hidden_columns: {
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
  }

  const indexes = await queryInterface.showIndex("user_column_preferences");
  if (!indexes.some((i) => i.name === "idx_user_column_preferences_user_report")) {
    await queryInterface.addIndex("user_column_preferences", {
      fields: ["a_application_login_id", "report_key"],
      name: "idx_user_column_preferences_user_report",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("user_column_preferences");
};
