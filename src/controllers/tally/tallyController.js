import { getTallySettings, saveTallySettings } from "../../services/tally/tallySettingsService.js";
import callServiceMethod from "../baseController.js";

export const tallyGetSettingsProvider = async (req, res) => {
  await callServiceMethod(req, res, getTallySettings(req), "tallyGetSettings");
};

export const tallySaveSettingsProvider = async (req, res) => {
  await callServiceMethod(req, res, saveTallySettings(req), "tallySaveSettings");
};
