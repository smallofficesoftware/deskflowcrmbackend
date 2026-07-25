import { allAccountTransactionOfEmployeePDF, createEmployeeAccountTransaction, employeeAccountTransactionById, employeePDFaccountv1, getAllEmployeeAccountTransactions, updateEmployeeAccountTransaction } from "../../services/activities/employeeAccountTransactionService.js";
import callServiceMethod from "../baseController.js";

export const allEmployeeAccountTransactions = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getAllEmployeeAccountTransactions(req, res),
        "allEmployeeAccountTransactions"
    );
};
export const employeeAccountTransactionsById = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        employeeAccountTransactionById(req),
        "employeeAccountTransactionById"
    );
};
export const employeeAccountTransactionCreate = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        createEmployeeAccountTransaction(req),
        "updateEmplyeeAccountTransaction"
    );
};
export const employeeAccountTransactionUpdate = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        updateEmployeeAccountTransaction(req),
        "updateEmplyeeAccountTransaction"
    );
};

export const getEmployeeAccountStatement = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getAccountStatementOfEmployee(req),
        "getAccountStatementOfEmployee"
    );
};

export const employeePDFv1 = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        employeePDFaccountv1(req),
        "employeePDFaccountv1"
    );
};

export const allemployeeAccountTransactionPDF = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        allAccountTransactionOfEmployeePDF(req),
        "allAccountTransactionOfContact"
    );
};
