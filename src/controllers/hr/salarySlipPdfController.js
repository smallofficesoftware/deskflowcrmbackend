import { exportSalarySlipPdf } from "../../services/hr/salarySlipPdfService.js";
import callServiceMethod from "../baseController.js";

export const salarySlipPdfProvider = async (req, res) => {
    await callServiceMethod(req, res, exportSalarySlipPdf(req), "salarySlipPdfProvider");
};
