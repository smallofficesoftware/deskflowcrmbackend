import {
    allemployeeAccountTransactionPDF,
    allEmployeeAccountTransactions,
    employeeAccountTransactionCreate,
    employeeAccountTransactionsById,
    employeeAccountTransactionUpdate,
    employeePDFv1
} from "../../controllers/activities/employeeAccountTransactionController.js";

import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post(
        "/employeeAccountTransactionList",
        authenticateToken,
        tenantMiddleware,
        allEmployeeAccountTransactions
    );
    app.post(
        "/emplyeeAccountTransactionList/:employee_id",
        authenticateToken,
        tenantMiddleware,
        allEmployeeAccountTransactions
    );
    app.post(
        "/employeeAccountTransactionById",
        authenticateToken,
        tenantMiddleware,
        employeeAccountTransactionsById
    );
    app.post(
        "/employeeAccountTransactionCreate",
        authenticateToken,
        tenantMiddleware,
        employeeAccountTransactionCreate
    );
    app.post(
        "/employeeAccountTransactionUpdate",
        authenticateToken,
        tenantMiddleware,
        employeeAccountTransactionUpdate
    );
    app.post(
        "/employeeAccountPDFv1",
        authenticateToken,
        tenantMiddleware,
        employeePDFv1
    );
    app.post(
        "/employeeAllAccountTransactionPDF",
        authenticateToken,
        tenantMiddleware,
        allemployeeAccountTransactionPDF
    );
};
