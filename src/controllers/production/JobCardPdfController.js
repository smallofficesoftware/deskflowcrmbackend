import { jobCardPdf, productionEntryPdf } from "../../services/production/jobCardPdfServices.js";
import callServiceMethod from "../baseController.js";

export const jobCardPdfProvider = async (req, res) => {
    await callServiceMethod(req, res, jobCardPdf(req), "jobCardPdfProvider");
};

export const productionEntryPdfProvider = async (req, res) => {
    await callServiceMethod(req, res, productionEntryPdf(req), "productionEntryPdfProvider");
};
