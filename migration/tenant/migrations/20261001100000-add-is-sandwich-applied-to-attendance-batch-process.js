/**
 * Migration Name: add-is-sandwich-applied-to-attendance-batch-process
 * Database Type: TENANT
 *
 * attendance_batch_process.is_sandwich_applied is written by the attendance
 * initialize/process flow (processAttendanceServices.js) and declared on
 * processAttendanceModel.js. It was only ever applied by hand (alter.txt,
 * 29-06-2026), so tenants that missed it fail INSERT with
 * "Unknown column 'is_sandwich_applied'". Idempotent.
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
  if (!(await columnExists(queryInterface, "attendance_batch_process", "is_sandwich_applied"))) {
    await queryInterface.addColumn("attendance_batch_process", "is_sandwich_applied", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
      after: "overtime_hour",
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "attendance_batch_process", "is_sandwich_applied")) {
    await queryInterface.removeColumn("attendance_batch_process", "is_sandwich_applied");
  }
};
