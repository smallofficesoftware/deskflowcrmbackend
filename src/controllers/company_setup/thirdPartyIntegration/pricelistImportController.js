import { decryptRequestForMultipart } from "../../../middlewares/payloadSecurity.js";
import { addPriceListByExcelSheetUpdateData } from "../../../services/excelImportsIntegration/pricelistExcelIntegrationService.js";
import callServiceMethod from "../../baseController.js";


export const getExcelSheetPriceListUpdateData = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(
        req,
        res,
        addPriceListByExcelSheetUpdateData(req),
        "getExcelSheetPriceListUpdateData"
    );
};