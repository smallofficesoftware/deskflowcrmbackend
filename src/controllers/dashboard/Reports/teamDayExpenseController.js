import callServiceMethod from "../../baseController.js";
import { teamDayExpense } from "../../../services/dashboard/Reports/teamDayExpenseServices.js";

export const getTeamExpense = async (req, res) => {
  await callServiceMethod(req, res, teamDayExpense(req), "teamDayExpense");
};
