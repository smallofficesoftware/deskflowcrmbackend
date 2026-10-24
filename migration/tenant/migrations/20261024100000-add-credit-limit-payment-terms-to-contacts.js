/**
 * Migration Name: add-credit-limit-payment-terms-to-contacts
 * Database Type: TENANT
 * Created: 24/10/2026
 *
 * P5 B2B mode (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt) - the design
 * conversation flagged at the end of P4: credit_limit (checked against the
 * contact's existing account_transactions closing balance, per the user) and
 * payment_terms (informational days, no automated enforcement this phase).
 * Both null/0 = not set/no limit.
 */

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface, "contact_masters", "credit_limit"))) {
    await queryInterface.addColumn("contact_masters", "credit_limit", { type: Sequelize.DOUBLE, allowNull: true });
  }
  if (!(await columnExists(queryInterface, "contact_masters", "payment_terms"))) {
    await queryInterface.addColumn("contact_masters", "payment_terms", { type: Sequelize.INTEGER, allowNull: true });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "contact_masters", "credit_limit")) {
    await queryInterface.removeColumn("contact_masters", "credit_limit");
  }
  if (await columnExists(queryInterface, "contact_masters", "payment_terms")) {
    await queryInterface.removeColumn("contact_masters", "payment_terms");
  }
};
