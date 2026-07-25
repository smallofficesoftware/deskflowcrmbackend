import { clearWhatsappDispatchJobs, createCron, createEmployeePayrollFromLogin, cronAllStart, cronAllStop, cronDataView, cronStart, cronStop, googleSheetsCroneTabRunner, indiaMartCroneTabRunner, sendDueTaskListMail, sendTaskTimeGapWiseInEmail, sendTaskTimeGapWiseInWhatsapp, taskCreationCroneTabRunner, tradeIndiaBuyLeadsCroneTabRunner, tradeIndiaCroneTabRunner } from "../../services/configuration/cronJobServices.js";
import callServiceMethod from "../baseController.js";

export const addCron = async (req, res) => {
    await callServiceMethod(req, res, createCron(req), "addCron");
};

export const viewCron = async (req, res) => {
    await callServiceMethod(req, res, cronDataView(req), "viewCron");
};

export const startCron = async (req, res) => {
    await callServiceMethod(req, res, cronStart(req), "startCron");
};

export const stopCron = async (req, res) => {
    await callServiceMethod(req, res, cronStop(req), "stopCron");
};

export const startAllCron = async (req, res) => {
    await callServiceMethod(req, res, cronAllStart(req), "startAllCron");
};

export const stopAllCron = async (req, res) => {
    await callServiceMethod(req, res, cronAllStop(req), "startAllCron");
};

export const indiaMartCroneTabProvider = async (req, res) => {
    await callServiceMethod(req, res, indiaMartCroneTabRunner(req), "indiaMartCroneTabProvider");
};
export const tradeIndiaCroneTabProvider = async (req, res) => {
    await callServiceMethod(req, res, tradeIndiaCroneTabRunner(req), "tradeIndiaCroneTabProvider");
};

export const tradeIndiaBuyLeadsCroneTabProvider = async (req, res) => {
    await callServiceMethod(req, res, tradeIndiaBuyLeadsCroneTabRunner(req), "tradeIndiaBuyLeadsCroneTabProvider");
};

export const googleSheetsCroneTabProvider = async (req, res) => {
    await callServiceMethod(req, res, googleSheetsCroneTabRunner(req), "googleSheetsCroneTabProvider");
};

export const taskCreationCroneTabProvider = async (req, res) => {
    await callServiceMethod(req, res, taskCreationCroneTabRunner(req), "taskCreationCroneTabProvider");
};

export const taskSendWhatsappCroneTabProvider = async (req, res) => {
    await callServiceMethod(req, res, sendTaskTimeGapWiseInWhatsapp(req), "taskSendWhatsappCroneTabProvider");
};

export const taskSendEmailCroneTabProvider = async (req, res) => {
    await callServiceMethod(req, res, sendTaskTimeGapWiseInEmail(req), "taskSendEmailCroneTabProvider");
};

export const sendDueTaskListMailProvider = async (req, res) => {
    await callServiceMethod(req, res, sendDueTaskListMail(req), "sendDueTaskListMailProvider");
};

export const clearWhatsappDispatchJobsProvder = async (req, res) => {
    await callServiceMethod(req, res, clearWhatsappDispatchJobs(req), "clearWhatsappDispatchJobsProvder");
};
export const wharehouseSalesAssignment = async (req, res) => {
    await callServiceMethod(req, res, createEmployeePayrollFromLogin(req, res), "clearWhatsappDispatchJobsProvder");
};