import { getprintsetting, newrightsprinteee, printsetting } from "../../services/company_setup/printSettingServices.js";
import callServiceMethod from "../baseController.js";


export const printSetting = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    printsetting(req),
    "printsetting"
  );
};

export const getprintSetting = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getprintsetting(req),
    "getprintsetting"
  );
};

export const newrightsprint = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    newrightsprinteee(req),
    "newrightsprint"
  );
};