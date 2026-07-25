import { getVisitReport } from "../../../services/dashboard/Reports/allVisitReportServices.js";
import callServiceMethod from "../../baseController.js";


export const allVisitReport = async (req,res)=>{
  await callServiceMethod(req, res, getVisitReport(req), "getVisitReport");

}