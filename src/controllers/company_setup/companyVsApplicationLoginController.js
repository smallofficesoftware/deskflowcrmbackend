import {
  companyLeave,
  companyPlanVsStatistics,
  deactivateTearmPerson,
  getAllJoinURL,
  getByIdTeam,
  getTeamChainWise,
  removeFromTeamList
} from "../../services/company_setup/companyVsApplicationLoginService.js";
import callServiceMethod from "../baseController.js";

export const invitationKeyJoin = async (req, res) => {
  await callServiceMethod(req, res, getAllJoinURL(req), "invitationKeyJoin");
};

export const myTeamList = async (req, res) => {
  await callServiceMethod(req, res, getByIdTeam(req), "myTeamList");
};
export const myTeamListChainWise = async (req, res) => {
  await callServiceMethod(req, res, getTeamChainWise(req), "myTeamListChainWise");
};

export const removeTeamList = async (req, res) => {
  await callServiceMethod(req, res, removeFromTeamList(req), "removeTeamList");
};

export const leaveCompany = async (req, res) => {
  await callServiceMethod(req, res, companyLeave(req), "companyLeave");
};

export const planVsStatistics = async (req, res) => {
  await callServiceMethod(req, res, companyPlanVsStatistics(req), "companyPlanVsStatistics");
};

export const deativateTeamList = async (req, res) => {
  await callServiceMethod(req, res, deactivateTearmPerson(req), "deativateTeamList");
};
