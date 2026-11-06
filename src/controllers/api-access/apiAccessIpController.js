import { getApiAccessIps, saveApiAccessIps } from "../../services/api-access/apiAccessIpService.js";
import callServiceMethod from "../baseController.js";

export const apiAccessIpsGetProvider = async (req, res) => {
  await callServiceMethod(req, res, getApiAccessIps(req), "apiAccessIpsGetProvider");
};
export const apiAccessIpsSaveProvider = async (req, res) => {
  await callServiceMethod(req, res, saveApiAccessIps(req), "apiAccessIpsSaveProvider");
};
