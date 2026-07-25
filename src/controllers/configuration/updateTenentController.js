import { updateTenent,pageVsplan } from "../../services/configuration/updateTenentServices.js";
import callServiceMethod from "../baseController.js";

export const tenentupdate = async (req, res) => {
  await callServiceMethod(req, res, updateTenent(req), "tenentupdate");
};
export const pageright = async (req, res) => {
  await callServiceMethod(req, res, pageVsplan(req), "tenentupdate");
};

