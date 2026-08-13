import {
  getColumnPreference,
  saveColumnPreference,
} from "../../services/application_login/userColumnPreferenceServices.js";
import callServiceMethod from "../baseController.js";

export const getColumnPreferenceController = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getColumnPreference(req),
    "getColumnPreference"
  );
};

export const saveColumnPreferenceController = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    saveColumnPreference(req),
    "saveColumnPreference"
  );
};
