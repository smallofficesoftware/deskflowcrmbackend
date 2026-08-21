/**
 * Migration Name: create-audit-logs
 * Database Type: TENANT
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("audit_logs", {
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
    module_key: {
      type: Sequelize.STRING,
    },
    action: {
      type: Sequelize.STRING,
    },
    entity_type: {
      type: Sequelize.STRING,
    },
    entity_id: {
      type: Sequelize.INTEGER,
    },
    details: {
      type: Sequelize.TEXT,
    },
    created_date_time: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  });

  await queryInterface.addIndex("audit_logs", {
    fields: ["company_masters_id", "module_key", "entity_type", "entity_id"],
    name: "idx_audit_logs_lookup",
  });

  await queryInterface.addIndex("audit_logs", {
    fields: ["created_date_time"],
    name: "idx_audit_logs_created_date_time",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("audit_logs");
};
