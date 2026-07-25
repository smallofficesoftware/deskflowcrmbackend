import { getTeamAttendanceReport } from "../../../services/dashboard/Reports/teamAttendanceReportServices.js";
import callServiceMethod from "../../baseController.js";

export const teamAttendance = async (req, res) => {
  await callServiceMethod(req, res,getTeamAttendanceReport(req),"getTeamAttendanceReport");
};
