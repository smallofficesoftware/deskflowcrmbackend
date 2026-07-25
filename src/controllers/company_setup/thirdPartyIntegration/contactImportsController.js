import { decryptRequestForMultipart } from "../../../middlewares/payloadSecurity.js";
import { addContactByExcelSheet, addContactByExcelSheetV2 } from "../../../services/excelImportsIntegration/contactExcelImportsIntegrationService.js";
import callServiceMethod from "../../baseController.js";

export const getExcelSheet = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(
        req,
        res,
        addContactByExcelSheet(req),
        "getExcelSheet"
    );
};
export const getExcelSheetV2 = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(
        req,
        res,
        addContactByExcelSheetV2(req),
        "getExcelSheet"
    );
};