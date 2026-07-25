import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import { attendanceCheck, attendanceDelete, attendanceUpdate, attendanceView, attendanceViewByDate, createManualAttendance, generateAttendanceSampleSheet } from "../../services/hr/attendanceServices.js";
import callServiceMethod from "../baseController.js";


export const checkAttendance = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, attendanceCheck(req), "checkAttendance");
}

export const viewAttendance = async (req, res) => {
    await callServiceMethod(req, res, attendanceView(req), "viewAttendance");
}

export const deleteAttendance = async (req, res) => {
    await callServiceMethod(req, res, attendanceDelete(req), "deleteAttendance");
}
export const updateAttendance = async (req, res) => {
    await callServiceMethod(req, res, attendanceUpdate(req), "updateAttendance");
}
export const createAttendance = async (req, res) => {
    await callServiceMethod(req, res, createManualAttendance(req), "createManualAttendance");
}
export const viewAttendanceByDate = async (req, res) => {
    await callServiceMethod(req, res, attendanceViewByDate(req), "attendanceViewByDate");
}
export const generateAttendanceSampleSheetProvider = async (req, res) => {
    await callServiceMethod(req, res, generateAttendanceSampleSheet(req), "generateAttendanceSampleSheetProvider");
}