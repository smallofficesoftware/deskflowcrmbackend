/**
 * Migration Name: add-stage-form-columns
 * Database Type: TENANT
 *
 * Custom field "Display on" (1 = Form, 2 = Stage form) + the stages a stage
 * form field is asked on (CSV of stage_status_masters.id), and a JSON snapshot
 * of the stage-form values (old -> new) stored on the status log row written
 * when a Contact / Inquiry is moved to a stage.
 */

const columnExists = async (queryInterface, table, column) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME = :column`,
    { replacements: { table, column } },
  );
  return Number(rows[0]?.c) > 0;
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface, "custom_field_form_masters", "display_on"))) {
    await queryInterface.addColumn("custom_field_form_masters", "display_on", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 1,
    });
  }
  await queryInterface.sequelize.query(
    "UPDATE `custom_field_form_masters` SET `display_on` = 1 WHERE `display_on` IS NULL OR `display_on` = 0",
  );

  if (!(await columnExists(queryInterface, "custom_field_form_masters", "stage_ids"))) {
    await queryInterface.addColumn("custom_field_form_masters", "stage_ids", {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null,
    });
  }

  if (!(await columnExists(queryInterface, "status_and_stages_logs", "stage_form_data"))) {
    await queryInterface.addColumn("status_and_stages_logs", "stage_form_data", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "status_and_stages_logs", "stage_form_data")) {
    await queryInterface.removeColumn("status_and_stages_logs", "stage_form_data");
  }
  if (await columnExists(queryInterface, "custom_field_form_masters", "stage_ids")) {
    await queryInterface.removeColumn("custom_field_form_masters", "stage_ids");
  }
  if (await columnExists(queryInterface, "custom_field_form_masters", "display_on")) {
    await queryInterface.removeColumn("custom_field_form_masters", "display_on");
  }
};
