/**
 * Migration Name: make-late-in-early-out-nullable-in-attendance-batch-process
 * Database Type: TENANT
 *
 * attendance_batch_process.late_in / early_out were created NOT NULL, but
 * processAttendanceModel.js declares them allowNull: true and
 * processAttendanceServices.js writes null for week-off / holiday / leave /
 * on-time days. attendance-d-up (bulkCreate) fails with
 * "Column 'early_out' cannot be null". Idempotent.
 */

const isNullable = async (queryInterface, table, column) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT IS_NULLABLE AS n
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME = :column`,
    { replacements: { table, column } },
  );
  return rows.length === 0 ? null : rows[0].n === "YES";
};

const TABLE = "attendance_batch_process";
const COLUMNS = ["late_in", "early_out"];

export const up = async (queryInterface, Sequelize) => {
  for (const column of COLUMNS) {
    if ((await isNullable(queryInterface, TABLE, column)) === false) {
      await queryInterface.changeColumn(TABLE, column, {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: null,
      });
    }
  }
};

export const down = async (queryInterface, Sequelize) => {
  for (const column of COLUMNS) {
    if ((await isNullable(queryInterface, TABLE, column)) === true) {
      await queryInterface.sequelize.query(
        `UPDATE \`${TABLE}\` SET \`${column}\` = '' WHERE \`${column}\` IS NULL`,
      );
      await queryInterface.changeColumn(TABLE, column, {
        type: Sequelize.STRING(100),
        allowNull: false,
      });
    }
  }
};
