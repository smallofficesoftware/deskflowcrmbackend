/**
 * Migration Name: add-invoice-entry-series-to-company-masters
 * Database Type: MASTER
 *
 * Default series of the debit / credit entry an invoice creates in Account
 * Transaction: one prefix and one pattern per cart type (sales invoice,
 * purchase invoice, sales return, purchase return). Same pattern format as
 * the invoice series (1 = prefix, 2 = number, 3A / 3a = financial year).
 * A blank prefix leaves that entry without a voucher number.
 *
 * Idempotent: columns that already exist are skipped.
 */

const TABLE = "company_masters";

const COLUMNS = (Sequelize) => ({
  invoice_entry_prefix: { type: Sequelize.STRING(50), allowNull: true },
  invoice_entry_series_pattern: { type: Sequelize.STRING(100), allowNull: true },
  purchase_entry_prefix: { type: Sequelize.STRING(50), allowNull: true },
  purchase_entry_series_pattern: { type: Sequelize.STRING(100), allowNull: true },
  return_sales_entry_prefix: { type: Sequelize.STRING(50), allowNull: true },
  return_sales_entry_series_pattern: { type: Sequelize.STRING(100), allowNull: true },
  return_purchase_entry_prefix: { type: Sequelize.STRING(50), allowNull: true },
  return_purchase_entry_series_pattern: { type: Sequelize.STRING(100), allowNull: true },
});

export const up = async (queryInterface, Sequelize) => {
  const existing = await queryInterface.describeTable(TABLE);
  for (const [name, definition] of Object.entries(COLUMNS(Sequelize))) {
    if (!existing[name]) await queryInterface.addColumn(TABLE, name, definition);
  }
};

export const down = async (queryInterface, Sequelize) => {
  for (const name of Object.keys(COLUMNS(Sequelize))) {
    await queryInterface.removeColumn(TABLE, name).catch(() => {});
  }
};
