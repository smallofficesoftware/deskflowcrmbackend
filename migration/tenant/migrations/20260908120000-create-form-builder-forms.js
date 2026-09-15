/**
 * Migration Name: create-form-builder-forms
 * Database Type: TENANT
 *
 * Custom Form Maker — form definitions. schema_json holds the draft field
 * tree; published_schema_json is the live version served to fillers.
 * submission_table_name records the per-form dynamic table
 * (fbs_<id>, created at first publish by formBuilderDdlBuilder.js, not by
 * a migration — see plan §1 "Publish failure / DDL recovery").
 * related_module is one of contact|product|inquiry|order|NULL.
 *
 * No dynamic grouping table (form_builder_form_groups) — forms are found
 * via the existing static reportsMenuData.tsx category taxonomy
 * (CRM/HRMS/Production/...), the same mechanism every other module already
 * uses, not a bespoke grouping feature for this one module.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_forms", {
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
      allowNull: false,
    },
    title: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.TEXT,
    },
    schema_json: {
      type: Sequelize.TEXT("long"),
    },
    published_schema_json: {
      type: Sequelize.TEXT("long"),
    },
    has_unpublished_changes: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    version: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    related_module: {
      type: Sequelize.STRING(50),
    },
    allow_public_submission: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    share_token: {
      type: Sequelize.STRING(64),
    },
    submission_table_name: {
      type: Sequelize.STRING(100),
    },
    restrict_to_assigned_team: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    display_order: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
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

  await queryInterface.addIndex("form_builder_forms", {
    fields: ["company_masters_id", "share_token"],
    unique: true,
    name: "uniq_form_builder_forms_company_share_token",
  });

  await queryInterface.addIndex("form_builder_forms", {
    fields: ["company_masters_id", "isDelete"],
    name: "idx_form_builder_forms_company_isdelete",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_forms");
};
