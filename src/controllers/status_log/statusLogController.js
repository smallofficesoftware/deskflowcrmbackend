import { getCustomerSupportTicketStatusLog, getStatus, getStatusLog } from "../../services/status_log/statusLogServices.js";
import callServiceMethod from "../baseController.js";

export const fetchStatusLog = async (req, res) => {
    await callServiceMethod(req, res, getStatusLog(req), "getStatusLog");
};
export const fetchCustomerSupportTicketStatusLog = async (req, res) => {
    await callServiceMethod(req, res, getCustomerSupportTicketStatusLog(req), "getStatusLog");
};

export const fetchStatus = async (req, res) => {
    await callServiceMethod(req, res, getStatus(req), "getStatus");
};