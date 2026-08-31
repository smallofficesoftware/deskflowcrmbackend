import { clearThirdPartyLogs, getThirdPartyLogs } from "../../services/activities/thirdPartyLogService.js";
import callServiceMethod from "../baseController.js";

export const getThirdPartyLogsProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getThirdPartyLogs(req),
        "getThirdPartyLogsProvider"
    );
};

export const clearThirdPartyLogsProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        clearThirdPartyLogs(req),
        "clearThirdPartyLogsProvider"
    );
};
