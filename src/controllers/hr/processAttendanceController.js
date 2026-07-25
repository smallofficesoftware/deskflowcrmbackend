import { attendanceDetailUpdate, compensationCalc, fetchProcessList, getAttendanceDetail, getEmployeeDetail, initializing, misPunchList } from "../../services/hr/processAttendanceServices.js";
import callServiceMethod from "../baseController.js";

export const misPunchListProvider = async (req, res) => {
    await callServiceMethod(req, res, misPunchList(req), "misPunchListProvider");
};

export const initializingProvider = async (req, res) => {
    await callServiceMethod(req, res, initializing(req), "initializingProvider");
};

export const attendanceDetailUpdateProvider = async (req, res) => {
    await callServiceMethod(req, res, attendanceDetailUpdate(req), "attendanceDetailUpdateProvider");
};

export const compensationCalcProvider = async (req, res) => {
    await callServiceMethod(req, res, compensationCalc(req), "compensationCalcProvider");
};

export const fetchProcessListProvider = async (req, res) => {
    await callServiceMethod(req, res, fetchProcessList(req), "fetchProcessListProvider");
};

export const fetchMonthlySlipProvider = async (req, res) => {
    await callServiceMethod(req, res, getAttendanceDetail(req), "fetchMonthlySlipProvider");
};

export const fetchMonthlySlipEmployeeProvider = async (req, res) => {
    await callServiceMethod(req, res, getEmployeeDetail(req), "fetchMonthlySlipEmployeeProvider");
};

