import { generateContactUpdateSheet, updateContactsByExcelSheet } from "../../../services/excelImportsIntegration/contactUpdateSheetService.js";
import callServiceMethod from "../../baseController.js";

export const generateContactUpdateSheetProvider = async (req, res) => {
    await callServiceMethod(req, res, generateContactUpdateSheet(req), "generateContactUpdateSheetProvider");
};

export const updateContactsByExcelSheetProvider = async (req, res) => {
    await callServiceMethod(req, res, updateContactsByExcelSheet(req), "updateContactsByExcelSheetProvider");
};
