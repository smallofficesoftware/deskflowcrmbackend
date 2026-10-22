/**
 * Migration Name: add-sellers-to-products
 * Database Type: TENANT
 * Created: 22/10/2026
 *
 * Product-wise team assignment: comma-separated a_application_login_id list of the team
 * members allowed to sell the product. NULL / empty = open to everyone (default), so every
 * existing product keeps behaving exactly as before.
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
  if (!(await columnExists(queryInterface, "products", "sellers_a_application_login_id"))) {
    await queryInterface.addColumn("products", "sellers_a_application_login_id", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "Comma-separated a_application_login_id of team members allowed to sell this product; empty = everyone",
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "products", "sellers_a_application_login_id")) {
    await queryInterface.removeColumn("products", "sellers_a_application_login_id");
  }
};
