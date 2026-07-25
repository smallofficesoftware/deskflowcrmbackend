import { addContactByIndiaMart, addContactByIndiaMartPushApi } from "../../../services/thirdPartyIntegration/indiaMartIntegrationService.js";
import callServiceMethod from "../../baseController.js";
export const indiaMartApi = async (req, res) => {
    await callServiceMethod(req, res, addContactByIndiaMart(req), "indiaMartApi");
};

export const indiaMartPushApi = async (req, res) => {
    await callServiceMethod(req, res, addContactByIndiaMartPushApi(req), "indiaMartPushApi");
};