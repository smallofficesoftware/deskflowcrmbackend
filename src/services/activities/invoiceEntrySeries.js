import moment from "moment";
import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { getFinancialYearRangeWise, isValid, resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { renderVoucherNumber } from "./accountTransactionSeries.js";

// Default series of the debit / credit entry an invoice creates in Account
// Transaction. One prefix and one pattern per cart type, kept on company_masters
// (master DB); a blank prefix leaves that entry without a voucher number.
export const INVOICE_ENTRY_SERIES_FIELDS = {
  3: { prefix: "invoice_entry_prefix", pattern: "invoice_entry_series_pattern" }, // sales invoice
  4: { prefix: "purchase_entry_prefix", pattern: "purchase_entry_series_pattern" }, // purchase invoice
  6: { prefix: "return_sales_entry_prefix", pattern: "return_sales_entry_series_pattern" }, // sales return
  7: { prefix: "return_purchase_entry_prefix", pattern: "return_purchase_entry_series_pattern" }, // purchase return
};

const ALL_COLUMNS = Object.values(INVOICE_ENTRY_SERIES_FIELDS).flatMap((f) => [f.prefix, f.pattern]);

// { fields } to save on the invoice's account_transactions row ({} when the
// cart type has no series set). Counter: max + 1 per type and prefix, restarting
// each financial year of the entry's date.
export const resolveInvoiceEntrySeries = async (
  tenantDB,
  { company_masters_id, cartType, type, payment_date_time }
) => {
  const config = INVOICE_ENTRY_SERIES_FIELDS[Number(cartType)];
  if (!config) return { fields: {} };

  const company = await companyModel.findOne({
    where: { id: company_masters_id, isDelete: 0 },
    attributes: [config.prefix, config.pattern],
    raw: true,
  });
  const prefix = String(company?.[config.prefix] ?? "").trim();
  if (!prefix) return { fields: {} };

  const date = payment_date_time || new Date();
  const { start_date, end_date } = getFinancialYearRangeWise(date);
  const highest = await accountTransactionsModel(tenantDB).max("sr_by_number", {
    where: {
      isDelete: 0,
      company_masters_id,
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
      voucher_number: renderVoucherNumber(company[config.pattern], prefix, nextNumber, moment(date).toDate()),
    },
  };
};

// Company settings screen: the four series of one company.
export const getInvoiceEntrySeries = async (req) => {
  try {
    const { company_id } = req.body;
    if (!company_id) return resBadRequest({ ack_msg: "company_id is required" });

    const company = await companyModel.findOne({
      where: { id: company_id, isDelete: 0 },
      attributes: ALL_COLUMNS,
      raw: true,
    });
    if (!company) return resBadRequest({ ack_msg: "Company not found" });

    const item = {};
    for (const column of ALL_COLUMNS) item[column] = company[column] ?? "";
    return resSuccess({ data: { item } });
  } catch (e) {
    return resBadRequest({ developer_msg: e.message });
  }
};

export const saveInvoiceEntrySeries = async (req) => {
  try {
    const { company_id } = req.body;
    if (!company_id) return resBadRequest({ ack_msg: "company_id is required" });

    const values = {};
    for (const column of ALL_COLUMNS) {
      const value = String(req.body[column] ?? "").trim();
      if (column.endsWith("_prefix")) {
        if (value.includes(",")) return resBadRequest({ ack_msg: "Only one series is allowed here" });
        if (value.length > 50) return resBadRequest({ ack_msg: "Series is too long" });
      } else if (value.length > 100) {
        return resBadRequest({ ack_msg: "Pattern is too long" });
      }
      values[column] = isValid(value) ? value : "";
    }

    const [updated] = await companyModel.update(values, { where: { id: company_id, isDelete: 0 } });
    if (!updated) return resBadRequest({ ack_msg: "Company not found" });
    return resSuccess({ ack_msg: "Invoice account entry series saved" });
  } catch (e) {
    return resBadRequest({ developer_msg: e.message });
  }
};
