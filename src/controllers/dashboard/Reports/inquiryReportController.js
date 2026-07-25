import callServiceMethod from "../../baseController.js";
import { inquiryReport } from "../../../services/dashboard/Reports/inquiryReportServices.js";

export const getInquiryReport = async (req, res) => {
  await callServiceMethod(req, res, inquiryReport(req), "inquiryReport");
};
