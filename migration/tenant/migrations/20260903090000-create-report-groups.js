/**
 * Migration Name: create-report-groups
 * Database Type: TENANT
 *
 * Tenant-defined organization for their own report_definitions (e.g.
 * "CRM", "HRMS", "Sales Team") — distinct from Step 1's system-gallery
 * `category` (admin-fixed, one of the PDF's 15 section names, applies
 * only to system_report_definitions). Flat, single-level (no sub-groups).
 * See report_group_id on report_definitions (separate migration).
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("report_groups", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    group_name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    display_order: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
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
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("report_groups");
};
