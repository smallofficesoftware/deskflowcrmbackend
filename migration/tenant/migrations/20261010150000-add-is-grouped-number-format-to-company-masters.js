/**
 * Migration Name: add-is-grouped-number-format-to-company-masters
 * Database Type: TENANT
 *
 * Company-wide print preference (ticket #2157): when enabled, amounts on
 * the order/quotation PDF (legacy EJS path) use Indian-style digit grouping
 * (1,50,000.00) instead of plain decimal (150000.00). Same column style as
 * the existing company_masters.is_strict_wharehouse_wise_product_stock_check
 * (plain INTEGER, 0/1). Idempotent.
 */

const TABLE = "company_masters";
const COLUMN = "is_grouped_number_format";

const columnExists = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME = :column`,
    { replacements: { table: TABLE, column: COLUMN } },
  );
  return Number(rows[0]?.c) > 0;
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface))) {
    await queryInterface.addColumn(TABLE, COLUMN, {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface)) {
    await queryInterface.removeColumn(TABLE, COLUMN);
  }
};
