import { decryptRequestForMultipart } from "../../../middlewares/payloadSecurity.js";
import { addProductByExcelSheetUpdateData, addProductByExcelSheetV2 } from "../../../services/excelImportsIntegration/productExcelImportsIntegrationService.js";
import callServiceMethod from "../../baseController.js";

export const getExcelSheetProductV2 = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(
        req,
        res,
        addProductByExcelSheetV2(req),
        "getExcelSheetProductV2"
    );
};
export const getExcelSheetProductUpdateData = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(
        req,
        res,
        addProductByExcelSheetUpdateData(req),
        "getExcelSheetProductUpdateData"
    );
};