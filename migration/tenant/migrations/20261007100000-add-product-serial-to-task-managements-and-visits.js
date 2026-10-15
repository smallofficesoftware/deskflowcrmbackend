/**
 * Migration Name: add-product-serial-to-task-managements-and-visits
 * Database Type: TENANT
 *
 * Task, Support Ticket (task_managements.is_support_ticket = 1) and Visit now
 * store an optional serial number, entered when the company has a
 * serial-tracked product (products.is_serial_number = 2); product_id is derived
 * from the serial. Idempotent.
 */

const TABLES = ["task_managements", "visits"];

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
  for (const table of TABLES) {
    if (!(await columnExists(queryInterface, table, "product_id"))) {
      await queryInterface.addColumn(table, "product_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
      });
    }
    if (!(await columnExists(queryInterface, table, "serial_number"))) {
      await queryInterface.addColumn(table, "serial_number", {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: null,
      });
    }
  }
};

export const down = async (queryInterface) => {
  for (const table of TABLES) {
    for (const column of ["serial_number", "product_id"]) {
      if (await columnExists(queryInterface, table, column)) {
        await queryInterface.removeColumn(table, column);
      }
    }
  }
};
