import { bomPdf } from "../../services/production/bomPdfServices.js";
import { jobCardPdf, productionEntryPdf } from "../../services/production/jobCardPdfServices.js";
import callServiceMethod from "../baseController.js";

export const bomPdfProvider = async (req, res) => {
    await callServiceMethod(req, res, bomPdf(req), "bomPdfProvider");
};

export const jobCardPdfProvider = async (req, res) => {
    await callServiceMethod(req, res, jobCardPdf(req), "jobCardPdfProvider");
};

export const productionEntryPdfProvider = async (req, res) => {
    await callServiceMethod(req, res, productionEntryPdf(req), "productionEntryPdfProvider");
};
