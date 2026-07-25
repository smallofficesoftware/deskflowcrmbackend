import {
    addContactFromTradeIndia, addContactFromTradeIndiaBuyLeads
} from "../../../services/thirdPartyIntegration/tradeIndiaIntegrationService.js";

import callServiceMethod from "../../baseController.js";

export const tradeIndiaApi = async (req, res) => {
    await callServiceMethod(req, res, addContactFromTradeIndia(req), "tradeIndiaApi");
};

export const tradeIndiaApiBuyLeads = async (req, res) => {
    await callServiceMethod(req, res, addContactFromTradeIndiaBuyLeads(req), "tradeIndiaApi");
};