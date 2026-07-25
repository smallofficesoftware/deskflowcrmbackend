import { decryptRequestForMultipart } from "../../../middlewares/payloadSecurity.js";
import { addTaskByExcelSheet } from "../../../services/excelImportsIntegration/taskExcelImportIntegrationService.js";
import callServiceMethod from "../../baseController.js";

export const getExcelSheetTask = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(
        req,
        res,
        addTaskByExcelSheet(req),
        "getExcelSheetTask"
    );
};