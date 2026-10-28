/**
 * Migration Name: add-gateway-ids-to-account-transactions
 * Database Type: TENANT
 * Created: 23/10/2026
 *
 * Ecommerce storefront P4 payment confirmation (plans/2026-10-15-ecommerce-
 * b2b-b2c-plan.txt) - REVISED 23-10-2026 per the user: no payment_status
 * column on carts (that's derived from account_transactions, same mechanism
 * accountTransactionCartLinkServices.js already uses via reference_table/
 * reference_id), and these two Razorpay identifiers go on account_transactions
 * itself, not carts (the user's own final call after a "put them in remarks"
 * suggestion was interrupted and reverted - see the plan's P4 section).
 */

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

const COLUMNS = ["gateway_order_id", "gateway_payment_id"];

export const up = async (queryInterface, Sequelize) => {
  for (const name of COLUMNS) {
    if (await columnExists(queryInterface, "account_transactions", name)) continue;
    await queryInterface.addColumn("account_transactions", name, { type: Sequelize.STRING, allowNull: true });
  }
};

export const down = async (queryInterface) => {
  for (const name of COLUMNS) {
    if (await columnExists(queryInterface, "account_transactions", name)) {
      await queryInterface.removeColumn("account_transactions", name);
    }
  }
};
