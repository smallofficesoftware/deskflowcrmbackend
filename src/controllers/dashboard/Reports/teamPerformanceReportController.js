import callServiceMethod from "../../baseController.js";
import { getTeamPerformanceReport } from "../../../services/dashboard/Reports/teamPerformanceReportServices.js";

export const teamPerformance = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getTeamPerformanceReport(req),
    "getTeamPerformanceReport"
  );
};
