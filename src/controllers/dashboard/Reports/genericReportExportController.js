import callServiceMethod from "../../baseController.js";
import { exportReportExcel, exportReportPdf } from "../../../services/dashboard/Reports/genericReportExportService.js";

export const exportReportExcelController = async (req, res) => {
  await callServiceMethod(req, res, exportReportExcel(req), "exportReportExcel");
};

export const exportReportPdfController = async (req, res) => {
  await callServiceMethod(req, res, exportReportPdf(req), "exportReportPdf");
};
