import callServiceMethod from "../../baseController.js";
import { getTeamPendingWorkReport } from "../../../services/dashboard/Reports/teamPendingWorkReportServices.js";

export const teamPendingWork = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getTeamPendingWorkReport(req),
    "getTeamPendingWorkReport"
  );
};
