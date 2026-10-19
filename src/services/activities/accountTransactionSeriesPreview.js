import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import {
  getPaymentTypeSeriesConfig,
  resolveAccountTransactionSeries,
} from "./accountTransactionSeries.js";

// Shown on the create-transaction form: the series of the chosen payment mode
// for the chosen credit / debit side, and the voucher number the next
// transaction would get (nothing is saved).
//   { manual: true }                       -> the user types the number
//   { prefixes: [], voucher_number: "" }   -> the mode has no series
//   otherwise                              -> prefixes to pick from + next number
export const getAccountTransactionSeriesPreview = async (req) => {
  try {
    const { a_application_login_id, mode, type, payment_date_time, sr_by_prifix } = req.body;
    if (!a_application_login_id || !mode || !type) {
      return resBadRequest({ ack_msg: "a_application_login_id, mode and type are required" });
    }

    const tenantDB = req.tenantDB;
    const config = await getPaymentTypeSeriesConfig(tenantDB, { mode, type });
    if (config.manual) {
      return resSuccess({ data: { manual: true, prefixes: [], voucher_number: "" } });
    }
    if (!config.prefixes.length) {
      return resSuccess({ data: { manual: false, prefixes: [], voucher_number: "" } });
    }

    const { company_masters_id } = await getCompanyByLoginId(a_application_login_id);
    const date = payment_date_time && !Number.isNaN(new Date(payment_date_time).getTime())
      ? payment_date_time
      : undefined;
    const series = await resolveAccountTransactionSeries(tenantDB, {
      company_masters_id,
      mode,
      type,
      payment_date_time: date,
      sr_by_prifix,
    });
    if (series.error) return resBadRequest({ ack_msg: series.error });

    return resSuccess({
      data: {
        manual: false,
        prefixes: config.prefixes,
        sr_by_prifix: series.fields.sr_by_prifix,
        voucher_number: series.fields.voucher_number,
      },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: e.message });
  }
};
