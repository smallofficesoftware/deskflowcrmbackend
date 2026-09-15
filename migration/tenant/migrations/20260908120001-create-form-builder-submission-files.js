/**
 * Migration Name: create-form-builder-submission-files
 * Database Type: TENANT
 *
 * Shared, normalized file store for every form's file/signature/image field
 * answers — one row per uploaded file, regardless of which per-form dynamic
 * table (fbs_<form_id>) the submission itself lives in. form_id is stored
 * alongside submission_id because submission_id alone isn't globally unique
 * across the many per-form dynamic tables. field_key supports a repeater
 * row path (e.g. "line_items[2].receipt_upload").
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_submission_files", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    form_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    submission_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    field_key: {
      type: Sequelize.STRING(255),
      allowNull: false,
    },
    file_type: {
      type: Sequelize.STRING(20),
      allowNull: false,
    },
    original_file_name: {
      type: Sequelize.STRING(255),
    },
    stored_file_name: {
      type: Sequelize.STRING(255),
    },
    file_path: {
      type: Sequelize.STRING(500),
    },
    mime_type: {
      type: Sequelize.STRING(100),
    },
    file_size: {
      type: Sequelize.INTEGER,
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

  await queryInterface.addIndex("form_builder_submission_files", {
    fields: ["form_id", "submission_id"],
    name: "idx_form_builder_submission_files_form_submission",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_submission_files");
};
