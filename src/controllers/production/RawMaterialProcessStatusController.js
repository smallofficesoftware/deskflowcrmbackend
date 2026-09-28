import { rawMaterialProcessStatusReport } from "../../services/production/rawMaterialProcessStatusReport.js";
import callServiceMethod from "../baseController.js";

export const rawMaterialProcessStatusReportProvider = async (req, res) => {
    await callServiceMethod(req, res, rawMaterialProcessStatusReport(req), "rawMaterialProcessStatusReportProvider");
};
