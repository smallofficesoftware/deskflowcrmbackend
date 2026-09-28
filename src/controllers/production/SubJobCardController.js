import { createSubJobCard } from "../../services/production/subJobCardServices.js";
import callServiceMethod from "../baseController.js";

export const createSubJobCardProvider = async (req, res) => {
    await callServiceMethod(req, res, createSubJobCard(req), "createSubJobCardProvider");
};
