import { getCompanyTeamList } from "../../services/company_setup/companyTeamListService.js";
import callServiceMethod from "../baseController.js";

export const companyTeamList = async (req, res) => {
  await callServiceMethod(req, res, getCompanyTeamList(req), "companyTeamList");
};
