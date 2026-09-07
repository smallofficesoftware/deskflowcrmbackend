/**
 * Migration Name: create-system-dashboard-definitions
 * Database Type: MASTER
 *
 * Dashboard feature, Phase 5 — admin-managed gallery of pre-built
 * dashboards a tenant can copy in one click (same "system_X table on the
 * master DB, read-only from the CRM backend, full CRUD from adminpanel's
 * own backend" precedent system_report_definitions/
 * system_document_templates already established). See
 * system_dashboard_widgets (separate migration) for the per-widget shape.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("system_dashboard_definitions", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: Sequelize.STRING,
    },
    description: {
      type: Sequelize.TEXT,
    },
    category: {
      type: Sequelize.STRING,
    },
    priority: {
      type: Sequelize.ENUM("critical", "high", "normal"),
    },
    icon: {
      type: Sequelize.STRING,
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

  await queryInterface.addIndex("system_dashboard_definitions", {
    fields: ["category"],
    name: "idx_system_dashboard_definitions_category",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("system_dashboard_definitions");
};
