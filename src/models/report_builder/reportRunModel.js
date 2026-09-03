import { DATE, ENUM, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const reportRunModel = (sequelize) => {
  return sequelize.define(
    "report_runs",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      report_definition_id: {
        type: INTEGER,
      },
      executed_by: {
        type: INTEGER,
      },
      executed_at: {
        type: DATE,
        defaultValue: NOW,
      },
      filters_snapshot_json: {
        type: TEXT,
      },
      row_count: {
        type: INTEGER,
      },
      duration_ms: {
        type: INTEGER,
      },
      success: {
        type: TINYINT,
        defaultValue: "1",
      },
      error_message: {
        type: STRING(500),
      },
      trigger_type: {
        type: ENUM("manual", "scheduled"),
        defaultValue: "manual",
      },
    },
    {
      // executed_at is the only timestamp this table tracks — no
      // separate created/modified pair the way most other tables have.
      timestamps: false,
    },
  );
};
