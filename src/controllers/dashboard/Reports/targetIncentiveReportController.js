import { getTargetIncentiveReport } from "../../../services/dashboard/Reports/targetIncentiveReportServices.js";
import callServiceMethod from "../../baseController.js";

export const targetIncentiveReport = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getTargetIncentiveReport(req),
        "getTargetIncentiveReport"
    );
};
