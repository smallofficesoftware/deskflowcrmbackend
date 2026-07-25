import callServiceMethod from "../../baseController.js";
// import { getTeamTaskReport } from "../services/Reports/teamAllReportServices.js";
import { getTeamReminderReport } from "../../../services/dashboard/Reports/reminderReportService.js";

export const getReminders = async (req, res) => {
    await callServiceMethod(req, res, getTeamReminderReport(req), "getTeamReminderReport");
};
