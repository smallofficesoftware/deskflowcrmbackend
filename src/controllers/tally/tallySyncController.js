import { getTallyPullStatus, listTallySyncLog, requestTallyPull } from "../../services/tally/tallySyncService.js";
import callServiceMethod from "../baseController.js";

export const tallyRequestPullProvider = async (req, res) => {
  await callServiceMethod(req, res, requestTallyPull(req), "tallyRequestPull");
};

export const tallyPullStatusProvider = async (req, res) => {
  await callServiceMethod(req, res, getTallyPullStatus(req), "tallyPullStatus");
};

export const tallySyncLogProvider = async (req, res) => {
  await callServiceMethod(req, res, listTallySyncLog(req), "tallySyncLog");
};
