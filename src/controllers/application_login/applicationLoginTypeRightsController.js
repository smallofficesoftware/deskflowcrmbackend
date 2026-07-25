import {
  AddTeamRights,
  getTeamRights,
} from "../../services/application_login/applicationLoginTypeRightsServices.js";
import callServiceMethod from "../baseController.js";

export const createApplicationLoginTypeRights = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    AddTeamRights(req),
    "createApplicationLoginTypeRights"
  );
};
export const teamRightsGet = async (req, res) => {
  await callServiceMethod(req, res, getTeamRights(req), "getTeamRights");
};
