/**
 * Migration Name: add-voucher-series-to-account-transactions
 * Database Type: TENANT
 *
 * Voucher number series for account transactions, like the invoice series:
 * every payment mode has a credit series and a debit series (comma-separated
 * prefixes, one pattern, optional manual entry), and each transaction stores
 * the number it was given.
 *
 * Idempotent: columns that already exist are skipped.
 */

const PAYMENT_TYPE_COLUMNS = (Sequelize) => ({
  credit_series_prefix: { type: Sequelize.STRING(255), allowNull: true },
  credit_series_pattern: { type: Sequelize.STRING(100), allowNull: true },
  credit_sr_manual: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  debit_series_prefix: { type: Sequelize.STRING(255), allowNull: true },
  debit_series_pattern: { type: Sequelize.STRING(100), allowNull: true },
  debit_sr_manual: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
});

const TRANSACTION_COLUMNS = (Sequelize) => ({
  sr_by_prifix: { type: Sequelize.STRING(50), allowNull: true },
  sr_by_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
  voucher_number: { type: Sequelize.STRING(100), allowNull: true },
});

const addMissing = async (queryInterface, table, columns) => {
  const existing = await queryInterface.describeTable(table);
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing[name]) await queryInterface.addColumn(table, name, definition);
  }
};

export const up = async (queryInterface, Sequelize) => {
  await addMissing(queryInterface, "payment_types", PAYMENT_TYPE_COLUMNS(Sequelize));
  await addMissing(queryInterface, "account_transactions", TRANSACTION_COLUMNS(Sequelize));
  await queryInterface.sequelize.query(
    "ALTER TABLE `account_transactions` ADD INDEX `idx_account_transactions_series` (`mode`, `type`, `sr_by_prifix`, `isDelete`)"
  ).catch(() => {});

  // Default series for payment types that have none: Bank (transaction_type 0)
  // = BR receipt / BP payment, everything else (Cash) = CR / CP.
  await queryInterface.sequelize.query(
    "UPDATE `payment_types` SET `credit_series_prefix` = IF(`transaction_type` = 0, 'BR', 'CR'), `credit_series_pattern` = '1/2/3A' WHERE `credit_series_prefix` IS NULL OR `credit_series_prefix` = ''"
  );
  await queryInterface.sequelize.query(
    "UPDATE `payment_types` SET `debit_series_prefix` = IF(`transaction_type` = 0, 'BP', 'CP'), `debit_series_pattern` = '1/2/3A' WHERE `debit_series_prefix` IS NULL OR `debit_series_prefix` = ''"
  );
  // The ready-made payment types each have their own series; one still on the
  // untouched BR / BP default moves to its own. Types a company added keep BR / BP.
  await queryInterface.sequelize.query(
    "UPDATE `payment_types` SET " +
      "`credit_series_prefix` = CASE LOWER(TRIM(`payment_type_name`)) WHEN 'kasar account' THEN 'KR' WHEN 'other' THEN 'OR' WHEN 'cash' THEN 'CR' WHEN 'cheque' THEN 'QR' WHEN 'online portal' THEN 'PR' WHEN 'upi' THEN 'UR' WHEN 'bank transfer by neft' THEN 'NR' WHEN 'bank transfer by rtgs' THEN 'RR' WHEN 'bank transfer by imps' THEN 'IR' END, " +
      "`debit_series_prefix` = CASE LOWER(TRIM(`payment_type_name`)) WHEN 'kasar account' THEN 'KP' WHEN 'other' THEN 'OP' WHEN 'cash' THEN 'CP' WHEN 'cheque' THEN 'QP' WHEN 'online portal' THEN 'PP' WHEN 'upi' THEN 'UP' WHEN 'bank transfer by neft' THEN 'NP' WHEN 'bank transfer by rtgs' THEN 'RP' WHEN 'bank transfer by imps' THEN 'IP' END " +
      "WHERE `credit_series_prefix` = 'BR' AND `debit_series_prefix` = 'BP' AND LOWER(TRIM(`payment_type_name`)) IN ('kasar account','other','cash','cheque','online portal','upi','bank transfer by neft','bank transfer by rtgs','bank transfer by imps')"
  );
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.sequelize.query(
    "ALTER TABLE `account_transactions` DROP INDEX `idx_account_transactions_series`"
  ).catch(() => {});
  for (const name of Object.keys(TRANSACTION_COLUMNS(Sequelize))) {
    await queryInterface.removeColumn("account_transactions", name).catch(() => {});
  }
  for (const name of Object.keys(PAYMENT_TYPE_COLUMNS(Sequelize))) {
    await queryInterface.removeColumn("payment_types", name).catch(() => {});
  }
};
