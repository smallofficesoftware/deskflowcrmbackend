import { reassignTeamMemberWork } from "../../services/company_setup/teamReassignService.js";
import callServiceMethod from "../baseController.js";

export const teamReassign = async (req, res) => {
  await callServiceMethod(req, res, reassignTeamMemberWork(req), "teamReassign");
};
