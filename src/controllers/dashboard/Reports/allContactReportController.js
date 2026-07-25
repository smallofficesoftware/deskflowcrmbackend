import callServiceMethod from "../../baseController.js";
import { getAllContactReport } from "../../../services/dashboard/Reports/allContactReportServices.js";

export const allcontactReport = async (req,res)=>{
    await callServiceMethod(req,res,getAllContactReport(req),"getAllContactReport");
};