import { decryptRequestForMultipart } from "../../../middlewares/payloadSecurity.js";
import { importAttendanceByExcel } from "../../../services/excelImportsIntegration/attendanceExcelImportsIntegrationService.js";
import callServiceMethod from "../../baseController.js";

export const getExcelSheetAttendance = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(
        req,
        res,
        importAttendanceByExcel(req),
        "getExcelSheetProductV2"
    );
};