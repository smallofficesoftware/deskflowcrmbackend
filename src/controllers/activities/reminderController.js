import { getAllReminder } from "../../services/activities/reminderServices.js";
import callServiceMethod from "../baseController.js";

export const allReminder = async (req, res) => {
  await callServiceMethod(req, res, getAllReminder(req), "allReminder");
};
