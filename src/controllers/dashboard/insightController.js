import { getAllInsight } from "../../services/dashboard/insightServices.js";
import callServiceMethod from "../baseController.js";

export const allInsight = async (req, res) => {
  await callServiceMethod(req, res, getAllInsight(req), "allInsight");
};
