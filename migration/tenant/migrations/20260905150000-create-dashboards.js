/**
 * Migration Name: create-dashboards
 * Database Type: TENANT
 *
 * Dashboard feature, Phase 1 — one row per saved dashboard, arranging
 * widgets (dashboard_widgets, separate migration) each backed by an
 * existing report_definitions row. See dashboard_widgets for the
 * widget-level shape.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("dashboards", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.TEXT,
    },
    // Named icon key (frontend's reportIcons.tsx) — same convention as
    // report_definitions.icon. NULL falls back to a default icon.
    icon: {
      type: Sequelize.STRING,
    },
    is_default: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
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

  await queryInterface.addIndex("dashboards", {
    fields: ["company_masters_id", "isDelete"],
    name: "idx_dashboards_company",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("dashboards");
};
