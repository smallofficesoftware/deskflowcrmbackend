import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import { storeSupportTicketCreate, storeSupportTicketGet, storeTicketCategoryGet, storeTicketContactGet, storeTicketMessageCreate, storeTicketMessageGet, storeTicketStatusLogFetch } from "../../services/online-store/supportTicketService.js";
import callServiceMethod from "../baseController.js";

export const CreateStoreSupportTicket = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, storeSupportTicketCreate(req), "storeSupportTicketCreate");
};

export const getStoreTicketCategory = async (req, res) => {
    await callServiceMethod(req, res, storeTicketCategoryGet(req), "storeTicketCategoryGet");
};

export const getStoreTicketContact = async (req, res) => {
    await callServiceMethod(req, res, storeTicketContactGet(req), "storeTicketContactGet");
};

export const getStoreSupportTicket = async (req, res) => {
    await callServiceMethod(req, res, storeSupportTicketGet(req), "storeSupportTicketGet");
};

export const fetchStoreTicketStatusLog = async (req, res) => {
    await callServiceMethod(req, res, storeTicketStatusLogFetch(req), "storeTicketStatusLogFetch");
};

export const getStoreTicketMessage = async (req, res) => {
    await callServiceMethod(req, res, storeTicketMessageGet(req), "storeTicketMessageGet");
};

export const createStoreTicketMessage = async (req, res) => {
    await callServiceMethod(req, res, storeTicketMessageCreate(req), "storeTicketMessageCreate");
};
