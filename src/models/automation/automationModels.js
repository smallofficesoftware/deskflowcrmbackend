import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

// Tenant-DB models for the Automations module. Tables are created by
// migration/tenant/migrations/20260926150000-create-automation-tables.js.
// JSON-ish columns (nodes, connections, trigger_config, context, input,
// output, business_hours, sample_payload) are LONGTEXT; services parse them.

const noTimestamps = { timestamps: false, freezeTableName: true };

export const automationFlowModel = (sequelize) =>
  sequelize.define("automation_flows", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: INTEGER },
    name: { type: STRING(150) },
    description: { type: TEXT },
    trigger_type: { type: STRING(60) },
    trigger_config: { type: TEXT("long") },
    nodes: { type: TEXT("long") },
    connections: { type: TEXT("long") },
    is_active: { type: TINYINT, defaultValue: 0 },
    is_paused: { type: TINYINT, defaultValue: 0 },
    version: { type: INTEGER, defaultValue: 1 },
    run_as_user_id: { type: INTEGER },
    allow_automation_trigger: { type: TINYINT, defaultValue: 0 },
    include_imported_records: { type: TINYINT, defaultValue: 0 },
    consecutive_failures: { type: INTEGER, defaultValue: 0 },
    paused_reason: { type: STRING(255) },
    last_run_at: { type: DATE },
    run_count: { type: INTEGER, defaultValue: 0 },
    created_by: { type: INTEGER },
    modified_by: { type: INTEGER },
    isDelete: { type: TINYINT, defaultValue: 0 },
    created_date_time: { type: DATE },
    modified_date: { type: DATE },
  }, noTimestamps);

export const automationFlowVersionModel = (sequelize) =>
  sequelize.define("automation_flow_versions", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    flow_id: { type: INTEGER },
    version: { type: INTEGER },
    trigger_type: { type: STRING(60) },
    trigger_config: { type: TEXT("long") },
    nodes: { type: TEXT("long") },
    connections: { type: TEXT("long") },
    saved_by: { type: INTEGER },
    saved_at: { type: DATE },
  }, noTimestamps);

export const automationExecutionModel = (sequelize) =>
  sequelize.define("automation_executions", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    flow_id: { type: INTEGER },
    flow_version: { type: INTEGER, defaultValue: 1 },
    company_masters_id: { type: INTEGER },
    record_type: { type: STRING(40) },
    record_id: { type: INTEGER },
    status: { type: STRING(20), defaultValue: "running" },
    current_node_id: { type: STRING(64) },
    resume_at: { type: DATE },
    wait_type: { type: STRING(20) },
    context: { type: TEXT("long") },
    error: { type: TEXT },
    is_test: { type: TINYINT, defaultValue: 0 },
    origin: { type: STRING(20), defaultValue: "user" },
    chain_depth: { type: INTEGER, defaultValue: 0 },
    parent_execution_id: { type: INTEGER },
    started_at: { type: DATE },
    completed_at: { type: DATE },
  }, noTimestamps);

export const automationExecutionLogModel = (sequelize) =>
  sequelize.define("automation_execution_logs", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    execution_id: { type: INTEGER },
    node_id: { type: STRING(64) },
    node_type: { type: STRING(60) },
    status: { type: STRING(20), defaultValue: "success" },
    input: { type: TEXT("long") },
    output: { type: TEXT("long") },
    error: { type: TEXT },
    start_time: { type: DATE(3) },
    end_time: { type: DATE(3) },
  }, noTimestamps);

export const automationWebhookModel = (sequelize) =>
  sequelize.define("automation_webhooks", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    flow_id: { type: INTEGER },
    company_masters_id: { type: INTEGER },
    token: { type: STRING(64) },
    secret: { type: STRING(100) },
    auth_type: { type: STRING(20), defaultValue: "token" },
    sample_payload: { type: TEXT("long") },
    listen_until: { type: DATE },
    is_active: { type: TINYINT, defaultValue: 1 },
    last_called_at: { type: DATE },
    isDelete: { type: TINYINT, defaultValue: 0 },
    created_date_time: { type: DATE },
  }, noTimestamps);

export const automationAssignPointerModel = (sequelize) =>
  sequelize.define("automation_assign_pointers", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    flow_id: { type: INTEGER },
    node_id: { type: STRING(64) },
    last_user_id: { type: INTEGER },
    updated_at: { type: DATE },
  }, noTimestamps);

export const automationRunMarkModel = (sequelize) =>
  sequelize.define("automation_run_marks", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    flow_id: { type: INTEGER },
    record_type: { type: STRING(40) },
    record_id: { type: INTEGER },
    period_key: { type: STRING(20), defaultValue: "" },
    created_at: { type: DATE },
  }, noTimestamps);

export const automationUsageModel = (sequelize) =>
  sequelize.define("automation_usage", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: INTEGER },
    year_month: { type: STRING(7) },
    runs: { type: INTEGER, defaultValue: 0 },
    updated_at: { type: DATE },
  }, noTimestamps);

export const automationSettingsModel = (sequelize) =>
  sequelize.define("automation_settings", {
    id: { type: INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: INTEGER },
    wa_limit_per_minute: { type: INTEGER },
    wa_limit_per_day: { type: INTEGER },
    quiet_hours_from: { type: STRING(8) },
    quiet_hours_to: { type: STRING(8) },
    business_hours: { type: TEXT("long") },
    timezone: { type: STRING(10), defaultValue: "+05:30" },
    failure_alert_user_ids: { type: STRING(255) },
    modified_by: { type: INTEGER },
    modified_date: { type: DATE },
  }, noTimestamps);

/** All automation models bound to one tenant connection. */
export const automationModels = (sequelize) => ({
  Flow: automationFlowModel(sequelize),
  FlowVersion: automationFlowVersionModel(sequelize),
  Execution: automationExecutionModel(sequelize),
  ExecutionLog: automationExecutionLogModel(sequelize),
  Webhook: automationWebhookModel(sequelize),
  AssignPointer: automationAssignPointerModel(sequelize),
  RunMark: automationRunMarkModel(sequelize),
  Usage: automationUsageModel(sequelize),
  Settings: automationSettingsModel(sequelize),
});
