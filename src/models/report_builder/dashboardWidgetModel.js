import { INTEGER, STRING, TEXT, TINYINT } from "sequelize";

// report_definition_id is a loose reference (app-enforced, no DB-level FK —
// same convention as every other report_builder table) into an EXISTING
// report_definitions row. A widget has no SQL engine of its own — it
// reuses that report_definition's query/composite/plugin engine as-is and
// only adds a chart type (widget_type), an axis/column mapping
// (chart_config_json), and a grid position on top.
export const dashboardWidgetModel = (sequelize) => {
  return sequelize.define(
    "dashboard_widgets",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      dashboard_id: {
        type: INTEGER,
      },
      report_definition_id: {
        type: INTEGER,
      },
      // 'bar' | 'line' | 'pie' | 'doughnut' | 'stat_tile' | 'table'
      widget_type: {
        type: STRING,
      },
      // Widget's own display title — may differ from the underlying
      // report_definitions.name.
      title: {
        type: STRING,
      },
      // Freeform JSON: label column key, series column key(s) + aggregate,
      // colors, stacked/horizontal (bar), stat-tile format — same
      // "TEXT blob, validated at read time" convention as
      // report_definitions' columns_json/filters_json.
      chart_config_json: {
        type: TEXT,
      },
      position_x: {
        type: INTEGER,
        defaultValue: 0,
      },
      position_y: {
        type: INTEGER,
        defaultValue: 0,
      },
      width: {
        type: INTEGER,
        defaultValue: 4,
      },
      height: {
        type: INTEGER,
        defaultValue: 3,
      },
      display_order: {
        type: INTEGER,
        defaultValue: 0,
      },
      isDelete: {
        type: TINYINT,
        defaultValue: "0",
      },
      isActive: {
        type: TINYINT,
        defaultValue: "1",
      },
    },
    {
      timestamps: true,
      createdAt: "created_date_time",
      updatedAt: "modified_date",
    },
  );
};
