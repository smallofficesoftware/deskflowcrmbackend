import callServiceMethod from "../../../controllers/baseController.js";
import { detailedExpenseGet } from "../../../services/dashboard/Reports/expenseDetailedReportServices.js";

export const getDetailedExpense = async (req, res) => {
    await callServiceMethod(req, res, detailedExpenseGet(req), "detailedExpenseGet");
};