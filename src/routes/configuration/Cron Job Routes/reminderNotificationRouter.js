import { startCroneExternalyReminderCron, startStopReminderCron } from "../../../controllers/configuration/Cron Job Controllers/reminderNotificationController.js";
import { authenticateToken } from "../../../middlewares/auth.js";


export default (app) => {
  app.post("/start-stop-reminder-notificaition", authenticateToken, startStopReminderCron);
  app.get("/start-reminder-notification/:cron_time", startCroneExternalyReminderCron);
};
