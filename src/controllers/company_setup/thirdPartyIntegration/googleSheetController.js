import { addContactByGoogleSheetForFacebook, getGoogleSheetsColumnsData, updateGoogleSheetsColumnsData } from "../../../services/excelImportsIntegration/googleSheetIntegrationService.js";
import callServiceMethod from "../../baseController.js";

export const getGoogleSheetForFacebook = async (req, res) => {
    await callServiceMethod(req, res, addContactByGoogleSheetForFacebook(req), "getGoogleSheetForFacebook");
};
export const updateGoogleSheetsColumns = async (req, res) => {
    await callServiceMethod(req, res, updateGoogleSheetsColumnsData(req), "deleteCompany");
}

export const getGoogleSheetColumns = async (req, res) => {
    await callServiceMethod(req, res, getGoogleSheetsColumnsData(req), "deleteCompany");
}

