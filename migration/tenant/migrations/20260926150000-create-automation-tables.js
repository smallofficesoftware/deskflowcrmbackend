/**
 * Migration Name: create-automation-tables
 * Database Type: TENANT
 *
 * Tables for the Automations module (trigger -> actions -> outputs flow
 * builder). Plan: plans/2026-09-26-automations-plan.txt, sections 6 and 13.
 *
 *   automation_flows            one row per flow (nodes/connections as JSON)
 *   automation_flow_versions    snapshot on every save (13.13)
 *   automation_executions       one row per run, holds waiting-run state
 *   automation_execution_logs   per-node input/output/error of a run
 *   automation_webhooks         incoming webhook URL per flow (T16.1)
 *   automation_assign_pointers  round-robin pointer per assign node
 *   automation_run_marks        "run once per record" / per-period dedupe
 *   automation_usage            runs per company per month (plan limits)
 *   automation_settings         per-company limits, quiet hours, timezone
 *
 * Webhook calls and WhatsApp/email sends are NOT stored here - they go to
 * the existing third_party_logs table (integration = 'AUTOMATION').
 *
 * Raw SQL kept byte-identical to alter.txt (26-09-2026 Dhaval). Each table
 * is skipped when it already exists, so this can also be run against
 * smalloffice_sample_tenant after the SQL was applied by hand.
 */

const TABLES = {
  automation_flows: `
    CREATE TABLE \`automation_flows\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`company_masters_id\` INT(11) NOT NULL,
      \`name\` VARCHAR(150) NOT NULL,
      \`description\` TEXT NULL DEFAULT NULL,
      \`trigger_type\` VARCHAR(60) NOT NULL,
      \`trigger_config\` LONGTEXT NULL DEFAULT NULL,
      \`nodes\` LONGTEXT NULL DEFAULT NULL,
      \`connections\` LONGTEXT NULL DEFAULT NULL,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 0,
      \`is_paused\` TINYINT(1) NOT NULL DEFAULT 0,
      \`version\` INT(11) NOT NULL DEFAULT 1,
      \`run_as_user_id\` INT(11) NULL DEFAULT NULL,
      \`allow_automation_trigger\` TINYINT(1) NOT NULL DEFAULT 0,
      \`include_imported_records\` TINYINT(1) NOT NULL DEFAULT 0,
      \`consecutive_failures\` INT(11) NOT NULL DEFAULT 0,
      \`paused_reason\` VARCHAR(255) NULL DEFAULT NULL,
      \`last_run_at\` DATETIME NULL DEFAULT NULL,
      \`run_count\` INT(11) NOT NULL DEFAULT 0,
      \`created_by\` INT(11) NULL DEFAULT NULL,
      \`modified_by\` INT(11) NULL DEFAULT NULL,
      \`isDelete\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_date_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`modified_date\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_af_company_trigger\` (\`company_masters_id\`, \`trigger_type\`, \`is_active\`, \`isDelete\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_flow_versions: `
    CREATE TABLE \`automation_flow_versions\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`flow_id\` INT(11) NOT NULL,
      \`version\` INT(11) NOT NULL,
      \`trigger_type\` VARCHAR(60) NOT NULL,
      \`trigger_config\` LONGTEXT NULL DEFAULT NULL,
      \`nodes\` LONGTEXT NULL DEFAULT NULL,
      \`connections\` LONGTEXT NULL DEFAULT NULL,
      \`saved_by\` INT(11) NULL DEFAULT NULL,
      \`saved_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_afv_flow_version\` (\`flow_id\`, \`version\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_executions: `
    CREATE TABLE \`automation_executions\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`flow_id\` INT(11) NOT NULL,
      \`flow_version\` INT(11) NOT NULL DEFAULT 1,
      \`company_masters_id\` INT(11) NOT NULL,
      \`record_type\` VARCHAR(40) NULL DEFAULT NULL,
      \`record_id\` INT(11) NULL DEFAULT NULL,
      \`status\` ENUM('running','waiting','success','failed','cancelled','skipped') NOT NULL DEFAULT 'running',
      \`current_node_id\` VARCHAR(64) NULL DEFAULT NULL,
      \`resume_at\` DATETIME NULL DEFAULT NULL,
      \`wait_type\` VARCHAR(20) NULL DEFAULT NULL,
      \`context\` LONGTEXT NULL DEFAULT NULL,
      \`error\` TEXT NULL DEFAULT NULL,
      \`is_test\` TINYINT(1) NOT NULL DEFAULT 0,
      \`origin\` VARCHAR(20) NOT NULL DEFAULT 'user',
      \`chain_depth\` INT(11) NOT NULL DEFAULT 0,
      \`parent_execution_id\` INT(11) NULL DEFAULT NULL,
      \`started_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`completed_at\` DATETIME NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_ae_flow\` (\`flow_id\`, \`started_at\`),
      INDEX \`idx_ae_waiting\` (\`status\`, \`resume_at\`),
      INDEX \`idx_ae_record\` (\`record_type\`, \`record_id\`),
      INDEX \`idx_ae_started\` (\`started_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_execution_logs: `
    CREATE TABLE \`automation_execution_logs\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`execution_id\` INT(11) NOT NULL,
      \`node_id\` VARCHAR(64) NOT NULL,
      \`node_type\` VARCHAR(60) NOT NULL,
      \`status\` ENUM('success','failed','skipped','waiting') NOT NULL DEFAULT 'success',
      \`input\` LONGTEXT NULL DEFAULT NULL,
      \`output\` LONGTEXT NULL DEFAULT NULL,
      \`error\` TEXT NULL DEFAULT NULL,
      \`start_time\` DATETIME(3) NOT NULL,
      \`end_time\` DATETIME(3) NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_ael_execution\` (\`execution_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_webhooks: `
    CREATE TABLE \`automation_webhooks\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`flow_id\` INT(11) NOT NULL,
      \`company_masters_id\` INT(11) NOT NULL,
      \`token\` VARCHAR(64) NOT NULL,
      \`secret\` VARCHAR(100) NULL DEFAULT NULL,
      \`auth_type\` VARCHAR(20) NOT NULL DEFAULT 'token',
      \`sample_payload\` LONGTEXT NULL DEFAULT NULL,
      \`listen_until\` DATETIME NULL DEFAULT NULL,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`last_called_at\` DATETIME NULL DEFAULT NULL,
      \`isDelete\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_date_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_aw_token\` (\`token\`),
      INDEX \`idx_aw_flow\` (\`flow_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_assign_pointers: `
    CREATE TABLE \`automation_assign_pointers\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`flow_id\` INT(11) NOT NULL,
      \`node_id\` VARCHAR(64) NOT NULL,
      \`last_user_id\` INT(11) NULL DEFAULT NULL,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_aap_flow_node\` (\`flow_id\`, \`node_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_run_marks: `
    CREATE TABLE \`automation_run_marks\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`flow_id\` INT(11) NOT NULL,
      \`record_type\` VARCHAR(40) NOT NULL,
      \`record_id\` INT(11) NOT NULL,
      \`period_key\` VARCHAR(20) NOT NULL DEFAULT '',
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_arm_flow_record_period\` (\`flow_id\`, \`record_type\`, \`record_id\`, \`period_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_usage: `
    CREATE TABLE \`automation_usage\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`company_masters_id\` INT(11) NOT NULL,
      \`year_month\` CHAR(7) NOT NULL,
      \`runs\` INT(11) NOT NULL DEFAULT 0,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_au_company_month\` (\`company_masters_id\`, \`year_month\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
  automation_settings: `
    CREATE TABLE \`automation_settings\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`company_masters_id\` INT(11) NOT NULL,
      \`wa_limit_per_minute\` INT(11) NULL DEFAULT NULL,
      \`wa_limit_per_day\` INT(11) NULL DEFAULT NULL,
      \`quiet_hours_from\` TIME NULL DEFAULT NULL,
      \`quiet_hours_to\` TIME NULL DEFAULT NULL,
      \`business_hours\` LONGTEXT NULL DEFAULT NULL,
      \`timezone\` VARCHAR(10) NOT NULL DEFAULT '+05:30',
      \`failure_alert_user_ids\` VARCHAR(255) NULL DEFAULT NULL,
      \`modified_by\` INT(11) NULL DEFAULT NULL,
      \`modified_date\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_as_company\` (\`company_masters_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `,
};

export const up = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  const names = tables.map((t) => (typeof t === "string" ? t : t.tableName));
  for (const [name, sql] of Object.entries(TABLES)) {
    if (!names.includes(name)) {
      await queryInterface.sequelize.query(sql);
    }
  }
};

export const down = async (queryInterface) => {
  for (const name of Object.keys(TABLES).reverse()) {
    await queryInterface.dropTable(name);
  }
};
