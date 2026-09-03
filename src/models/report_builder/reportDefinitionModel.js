import { INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const reportDefinitionModel = (sequelize) => {
  return sequelize.define(
    "report_definitions",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      a_application_login_id: {
        type: INTEGER,
      },
      name: {
        type: STRING,
      },
      type: {
        type: STRING,
        defaultValue: "query",
      },
      page_id: {
        type: INTEGER,
      },
      model_key: {
        type: STRING,
      },
      plugin_key: {
        type: STRING,
      },
      columns_json: {
        type: TEXT,
      },
      filters_json: {
        type: TEXT,
      },
      group_by_json: {
        type: TEXT,
      },
      // system_report_definitions.id (master DB) this row was copied from
      // via copyFromSystemReportDefinition, or null for a report the tenant
      // built from scratch — see migration
      // 20260902100001-add-source-system-report-definition-id-to-report-definitions.js.
      source_system_report_definition_id: {
        type: INTEGER,
      },
      // JSON array of general-filter slot numbers (see
      // generalFilterAdapter.ts) the author picked as this report's
      // default — NULL means "show every slot this table has."
      filters_to_show: {
        type: TEXT,
      },
      // Tenant-defined organization (Step 10) — distinct from
      // system_report_definitions' admin-fixed `category`. NULL = ungrouped.
      report_group_id: {
        type: INTEGER,
      },
      // Report-picker search matches name + description (Step 5's "Search
      // scope" decision).
      description: {
        type: TEXT,
      },
      // Which named icon (frontend's reportIcons.tsx REPORT_ICON_PATHS
      // key) this report's tile shows — NULL falls back to "report".
      icon: {
        type: STRING,
      },
      s_timestemp: {
        type: STRING,
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
