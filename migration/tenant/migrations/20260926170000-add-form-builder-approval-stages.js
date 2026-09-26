/**
 * Migration Name: add-form-builder-approval-stages
 * Database Type: TENANT
 *
 * Form Builder approval stages (plan item I): a form can pass through
 * ordered stages (Counsellor -> Division Head -> Quotation Issuer ...), each
 * stage filled and signed by its own people.
 *
 *  - form_builder_forms.settings_json / published_settings_json: form-level
 *    settings, draft and published (versioned together with schema_json).
 *    Holds { approval: { enabled, stages: [...] } }.
 *  - form_builder_stage_log: who submitted / approved / sent back / edited a
 *    completed entry, at which stage, when, and the comment.
 *
 * The per-entry state (current_stage, stage_status) lives on each form's own
 * fbs_<form_id> table and is added by the publish step, not here.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("form_builder_forms");
  if (!table.settings_json) {
    await queryInterface.addColumn("form_builder_forms", "settings_json", { type: Sequelize.TEXT("long"), allowNull: true });
  }
  if (!table.published_settings_json) {
    await queryInterface.addColumn("form_builder_forms", "published_settings_json", { type: Sequelize.TEXT("long"), allowNull: true });
  }

  await queryInterface.createTable("form_builder_stage_log", {
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
    stage_id: {
      type: Sequelize.STRING(20),
      allowNull: false,
    },
    stage_name: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    action: {
      type: Sequelize.STRING(20),
      allowNull: false, // submit | approve | send_back | edit_completed
    },
    comment: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: true, // null for a public submission
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
  });

  await queryInterface.addIndex("form_builder_stage_log", {
    fields: ["form_id", "submission_id", "created_date_time"],
    name: "idx_form_builder_stage_log_submission",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_stage_log");
  const table = await queryInterface.describeTable("form_builder_forms");
  if (table.published_settings_json) await queryInterface.removeColumn("form_builder_forms", "published_settings_json");
  if (table.settings_json) await queryInterface.removeColumn("form_builder_forms", "settings_json");
};
