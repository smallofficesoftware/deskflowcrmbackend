import moment from "moment";
import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import {
  getFinancialYear,
  getFinancialYearRangeWise,
  isValid,
} from "../../utils/sharedFunctions.js";

// Voucher number series for account transactions, same shape as the invoice
// series (getNumberSeries): comma-separated prefixes per payment mode and
// type, one pattern, next number = max + 1 inside the financial year.
// Credit (type 1) and debit (type 2) of a payment mode each have their own
// prefixes, pattern and manual-entry switch on payment_types.
const CREDIT_TYPE = 1;

const splitPrefixes = (value) =>
  String(value ?? "")
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);

export const renderVoucherNumber = (pattern, prefix, number, date) => {
  const padded = String(number).padStart(2, "0");
  if (isValid(pattern) && pattern !== "0") {
    const parts = {
      "1": prefix,
      "2": padded,
      "3A": getFinancialYear(date),
      "3a": getFinancialYear(date, true),
    };
    return pattern.replace(/3A|3a|1|2/g, (match) => parts[match]);
  }
  return `${prefix}/${padded}/${getFinancialYear(date)}`;
};

// Series settings of one payment mode for one transaction type.
export const getPaymentTypeSeriesConfig = async (tenantDB, { mode, type }) => {
  const paymentType = await paymentTypeModel(tenantDB).findOne({
    where: { id: mode, isDelete: 0 },
    raw: true,
  });
  if (!paymentType) return { prefixes: [], pattern: null, manual: false };

  const side = Number(type) === CREDIT_TYPE ? "credit" : "debit";
  return {
    prefixes: splitPrefixes(paymentType[`${side}_series_prefix`]),
    pattern: paymentType[`${side}_series_pattern`],
    manual: Number(paymentType[`${side}_sr_manual`]) === 1,
  };
};

// Fields to save on a new account_transactions row, or { error } to refuse it.
//   no series set on the mode  -> { fields: {} }, saved without a number
//   manual switch on           -> needs entered_series_number, duplicate checked
//   otherwise                  -> auto number from sr_by_prifix (default: first)
export const resolveAccountTransactionSeries = async (
  tenantDB,
  { company_masters_id, mode, type, payment_date_time, sr_by_prifix, entered_series_number }
) => {
  const config = await getPaymentTypeSeriesConfig(tenantDB, { mode, type });
  const model = accountTransactionsModel(tenantDB);

  if (config.manual) {
    const voucherNumber = String(entered_series_number ?? "").trim();
    if (!voucherNumber) return { error: "Please enter voucher number" };

    const duplicate = await model.findOne({
      where: { isDelete: 0, mode, type: Number(type), voucher_number: voucherNumber },
      attributes: ["id"],
    });
    if (duplicate) return { error: "Entered voucher number already exists" };

    return { fields: { sr_by_prifix: "", sr_by_number: 0, voucher_number: voucherNumber } };
  }

  if (!config.prefixes.length) return { fields: {} };

  const prefix = isValid(sr_by_prifix) ? String(sr_by_prifix).trim() : config.prefixes[0];
  if (!config.prefixes.includes(prefix)) return { error: "Selected series is not available" };

  const date = payment_date_time || new Date();
  const { start_date, end_date } = getFinancialYearRangeWise(date);
  const highest = await model.max("sr_by_number", {
    where: {
      isDelete: 0,
      company_masters_id,
      mode,
      type: Number(type),
      sr_by_prifix: prefix,
      payment_date_time: {
        [Op.gte]: `${start_date} 00:00:00`,
        [Op.lte]: `${end_date} 23:59:59`,
      },
    },
  });
  const nextNumber = (highest || 0) + 1;

  return {
    fields: {
      sr_by_prifix: prefix,
      sr_by_number: nextNumber,
      voucher_number: renderVoucherNumber(config.pattern, prefix, nextNumber, moment(date).toDate()),
    },
  };
};
