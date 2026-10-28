import { getAppStatus } from "../../services/apps/appsService.js";
import callServiceMethod from "../baseController.js";

export const getAppStatusController = async (req, res) => {
  await callServiceMethod(req, res, getAppStatus(req), "getAppStatus");
};
