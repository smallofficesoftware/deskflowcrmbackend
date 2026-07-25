import callServiceMethod from "../../../controllers/baseController.js";
import { processAttendanceGet } from "../../../services/dashboard/Reports/processAttendanceReportServices.js";

export const getProcessAttendance = async (req, res) => {
    await callServiceMethod(req, res, processAttendanceGet(req), "processAttendanceGet");
};