import { getCallReport } from "../../../services/dashboard/Reports/allCallReportServices.js";
import callServiceMethod from "../../baseController.js";


export const allCallReport = async (req,res)=>{
  await callServiceMethod(req, res, getCallReport(req), "getCallReport");

}