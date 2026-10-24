import { getMyDaySummary } from "../../services/activities/myDaySummaryServices.js";
import callServiceMethod from "../baseController.js";

export const getMyDaySummaryProvider = async (req, res) => {
    await callServiceMethod(req, res, getMyDaySummary(req), "getMyDaySummary");
};
