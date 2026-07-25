import {
  getAccountOutstandingReport,
  getAllAccountTranstionsReport
} from "../../../services/dashboard/Reports/accountReportServices.js";
import callServiceMethod from "../../baseController.js";


export const accountOutstandingReport = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAccountOutstandingReport(req),
    "accountOutstandingReport"
  );
};

export const allAcountTranctionReport = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllAccountTranstionsReport(req),
    "getAllAccountTranstionsReport"
  );
};