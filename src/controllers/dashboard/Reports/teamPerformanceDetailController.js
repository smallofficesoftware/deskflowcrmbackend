import { getTeamPerformanceDetail } from "../../../services/dashboard/Reports/teamPerformanceActivityServices.js";
import callServiceMethod from "../../baseController.js";

export const getTeamPerformanceDetailProvider = async (req, res) => {
    await callServiceMethod(req, res, getTeamPerformanceDetail(req), "getTeamPerformanceDetail");
};
