import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import { createEmployeePayrollData, fetchEmployeePayroll, updateEmployeePayroll } from "../../services/hr/employeePayrollServices.js";
import callServiceMethod from "../baseController.js";


export const createEmpPayroll = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, createEmployeePayrollData(req), "createEmpPayroll");
}
export const fetchEmpPayroll = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, fetchEmployeePayroll(req), "fetchEmpPayroll");
}
export const updateEmpPayroll = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, updateEmployeePayroll(req), "updateEmpPayroll");
}
