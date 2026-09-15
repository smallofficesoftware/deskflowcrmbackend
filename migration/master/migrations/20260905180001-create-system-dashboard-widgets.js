/**
 * Migration Name: create-system-dashboard-widgets
 * Database Type: MASTER
 *
 * Dashboard feature, Phase 5 — one row per widget in a gallery dashboard.
 * Deliberately a SIMPLER shape than a full report_definitions row (no
 * arbitrary columns_json/filters_json here) — model_key + an optional
 * label_column (grouping dimension, for chart types) + a value_column +
 * aggregate, same single-aggregate shape the tenant-facing "quick
 * counter" shortcut already uses (dashboardWidgetServices.js's
 * addQuickCounterWidget). copyFromSystemDashboardDefinition expands this
 * into a real tenant report_definitions row (columns_json/group_by_json)
 * at copy time — see that function's own comment for the exact mapping.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("system_dashboard_widgets", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    system_dashboard_definition_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    widget_type: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    title: {
      type: Sequelize.STRING,
    },
    model_key: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    label_column: {
      type: Sequelize.STRING,
    },
    value_column: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    aggregate: {
      type: Sequelize.STRING,
    },
    position_x: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    position_y: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    width: {
      type: Sequelize.INTEGER,
      defaultValue: 4,
    },
    height: {
      type: Sequelize.INTEGER,
      defaultValue: 3,
    },
    display_order: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
  });

  await queryInterface.addIndex("system_dashboard_widgets", {
    fields: ["system_dashboard_definition_id", "isDelete"],
    name: "idx_system_dashboard_widgets_definition",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("system_dashboard_widgets");
};
