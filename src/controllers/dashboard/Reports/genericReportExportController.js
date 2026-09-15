import callServiceMethod from "../../baseController.js";
import { exportReportExcel } from "../../../services/dashboard/Reports/genericReportExportService.js";

export const exportReportExcelController = async (req, res) => {
  await callServiceMethod(req, res, exportReportExcel(req), "exportReportExcel");
};
