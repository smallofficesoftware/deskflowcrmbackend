import { createSubJobCard } from "../../services/production/subJobCardServices.js";
import { createAllSubJobCards } from "../../services/production/subJobCardAllServices.js";
import { subJobCardTree } from "../../services/production/subJobCardTreeServices.js";
import callServiceMethod from "../baseController.js";

export const createSubJobCardProvider = async (req, res) => {
    await callServiceMethod(req, res, createSubJobCard(req), "createSubJobCardProvider");
};

export const createAllSubJobCardsProvider = async (req, res) => {
    await callServiceMethod(req, res, createAllSubJobCards(req), "createAllSubJobCardsProvider");
};

export const subJobCardTreeProvider = async (req, res) => {
    await callServiceMethod(req, res, subJobCardTree(req), "subJobCardTreeProvider");
};
