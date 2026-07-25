import callServiceMethod from "../../baseController.js";
// import { getTeamTaskReport } from "../services/Reports/teamAllReportServices.js";
import { getTeamTaskReport } from "../../../services/dashboard/Reports/teamAllTaskReportServices.js";

export const getTeamTask = async (req, res) => {
  await callServiceMethod(req, res, getTeamTaskReport(req), "getTeamTaskReport");
};
