import { addContactByjustdialPushApi } from "../../../services/thirdPartyIntegration/justdialintegrationService.js";
import callServiceMethod from "../../baseController.js";

export const justdialPushApi = async (req, res) => {
    await callServiceMethod(req, res, addContactByjustdialPushApi(req), "addContactByjustdialPushApi");
};