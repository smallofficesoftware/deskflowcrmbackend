import { getWorkspaceLimitInfo } from "../../services/company_setup/workspaceLimit.js";
import callServiceMethod from "../baseController.js";

export const workspaceLimitInfo = async (req, res) => {
  await callServiceMethod(req, res, getWorkspaceLimitInfo(req), "workspaceLimitInfo");
};
