/**
 * Migration Name: create-dashboard-widgets
 * Database Type: TENANT
 *
 * Dashboard feature, Phase 1 — one row per widget on a dashboard. A widget
 * has NO SQL engine of its own: report_definition_id is a loose reference
 * (app-enforced, no DB-level FK — same convention as every other
 * report_builder table) into an EXISTING report_definitions row, reusing
 * its query/composite/plugin engine as-is. The widget only adds a chart
 * type, an axis/column mapping (chart_config_json), and a grid position.
 *
 * Known limits deliberately left for Phase 2 to solve (see the Phase 1
 * plan's "Known limits" section) — no caching, no delete-guard against a
 * referenced report_definitions row being removed, no per-dashboard widget
 * cap. None of those need a Phase 1 schema change.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("dashboard_widgets", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    dashboard_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    report_definition_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    // 'bar' | 'line' | 'pie' | 'doughnut' | 'stat_tile' | 'table'
    widget_type: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    // Widget's own display title — may differ from the underlying
    // report_definitions.name.
    title: {
      type: Sequelize.STRING,
    },
    // Freeform JSON: label column key, series column key(s) + aggregate,
    // colors, stacked/horizontal (bar), stat-tile format — same
    // "TEXT blob, validated at read time" convention as report_definitions'
    // columns_json/filters_json.
    chart_config_json: {
      type: Sequelize.TEXT,
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
    created_date_time: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    modified_date: {
      type: Sequelize.DATE,
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

  await queryInterface.addIndex("dashboard_widgets", {
    fields: ["dashboard_id", "isDelete"],
    name: "idx_dashboard_widgets_dashboard",
  });
  await queryInterface.addIndex("dashboard_widgets", {
    fields: ["report_definition_id"],
    name: "idx_dashboard_widgets_report_definition",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("dashboard_widgets");
};
