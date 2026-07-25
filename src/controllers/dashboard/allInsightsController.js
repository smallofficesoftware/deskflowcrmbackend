import { getCrmInsight, getHrmsInsight, getHrmsLeaderboard, getHrmsTeamTracking, getProductionInsight } from "../../services/dashboard/allInsightsServices.js";
import callServiceMethod from "../baseController.js";

export const crmInsight = async (req, res) => {
    await callServiceMethod(req, res, getCrmInsight(req), "getCrmInsight");
};

export const hrmsInsight = async (req, res) => {
    await callServiceMethod(req, res, getHrmsInsight(req), "getHrmsInsight");
};

export const hrmsLeaderboard = async (req, res) => {
    await callServiceMethod(req, res, getHrmsLeaderboard(req), "getHrmsLeaderboard");
};

export const hrmsTeamTracking = async (req, res) => {
    await callServiceMethod(req, res, getHrmsTeamTracking(req), "getHrmsTeamTracking");
};

export const productionInsight = async (req, res) => {
    await callServiceMethod(req, res, getProductionInsight(req), "getProductionInsight");
};