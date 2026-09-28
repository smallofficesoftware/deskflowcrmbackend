import { getWorkspaceTeam, updateWorkspaceTeam } from "../../services/company_setup/workspaceTeamService.js";
import callServiceMethod from "../baseController.js";

export const workspaceTeamGet = async (req, res) => {
  await callServiceMethod(req, res, getWorkspaceTeam(req), "workspaceTeamGet");
};

export const workspaceTeamUpdate = async (req, res) => {
  await callServiceMethod(req, res, updateWorkspaceTeam(req), "workspaceTeamUpdate");
};
