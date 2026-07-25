import {
    addContactMessageFromWhatsApp,
    getPermissionForWhatsAppMessage
} from "../../../services/thirdPartyIntegration/whatsappIntegrationServices.js";

import callServiceMethod from "../../baseController.js";
export const whatsappSendMessagesWebhook = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        addContactMessageFromWhatsApp(req),
        "whatsappSendMessagesWebhook"
    );
};
export const getPermissionWhatsAppMessage = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getPermissionForWhatsAppMessage(req),
        "whatsappSendMessagesWebhook"
    );
};