import { CreateStoreSupportTicket, createStoreTicketMessage, fetchStoreTicketStatusLog, getStoreSupportTicket, getStoreTicketCategory, getStoreTicketContact, getStoreTicketMessage } from "../../controllers/online-store/supportTicketController.js";
import { storeUpload } from "../../middlewares/multer.js";

export default (app) => {
    app.post("/create-store-support-ticket", storeUpload, CreateStoreSupportTicket);
    app.post("/get-store-ticket-category", getStoreTicketCategory);
    app.post("/get-store-ticket-contact", getStoreTicketContact);
    app.post("/get-store-support-ticket", getStoreSupportTicket);
    app.post("/fetch-store-ticket-status-log", fetchStoreTicketStatusLog);
    app.post("/get-store-ticket-message", getStoreTicketMessage);
    app.post("/create-store-ticket-message", createStoreTicketMessage);
}