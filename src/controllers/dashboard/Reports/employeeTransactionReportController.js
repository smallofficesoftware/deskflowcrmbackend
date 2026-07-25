import callServiceMethod from "../../../controllers/baseController.js";
import { getEmployeeAccountOutstandingReport, getEmployeeAccountTranctionReport } from "../../../services/dashboard/Reports/employeeTransactionReportService.js";

export const employeeAccountTranctionReport = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getEmployeeAccountTranctionReport(req),
        "getEmployeeAccountTranctionReport"
    );
};

export const employeeAccountOutstandingReport = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getEmployeeAccountOutstandingReport(req),
        "employeeAccountOutstandingReport"
    );
};