import { reminderCronStartStop, runExternalCroneAPI } from "../../../services/configuration/Cron Job Services/reminderNotificationServices.js";
import callServiceMethod from "../../baseController.js";

export const startStopReminderCron = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    reminderCronStartStop(req),
    "startStopReminderCron"
  );
};

export const startCroneExternalyReminderCron = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    runExternalCroneAPI(req),
    "startCroneExternalyReminderCron"
  );
};
