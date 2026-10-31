import { addCron, clearWhatsappDispatchJobsProvder, googleSheetsCroneTabProvider, indiaMartCroneTabProvider, sendDueTaskListMailProvider, startAllCron, startCron, stopAllCron, stopCron, taskCreationCroneTabProvider, taskSendEmailCroneTabProvider, taskSendWhatsappCroneTabProvider, tradeIndiaBuyLeadsCroneTabProvider, tradeIndiaCroneTabProvider, viewCron, wharehouseSalesAssignment } from "../../controllers/configuration/cronJobsController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { cronKeyGuard } from "../../middlewares/cronKeyGuard.js";


export default (app) => {
  app.post("/addCron", authenticateToken, addCron);
  app.post("/viewCron", authenticateToken, viewCron);
  app.post("/startCron", authenticateToken, startCron);
  app.post("/stopCron", authenticateToken, stopCron);
  app.post("/startAllCron", authenticateToken, startAllCron);
  app.post("/stopAllCron", authenticateToken, stopAllCron);
  app.post("/india-mart-crone-tab", cronKeyGuard, indiaMartCroneTabProvider);
  app.post("/trade-india-crone-tab", cronKeyGuard, tradeIndiaCroneTabProvider);
  app.post("/trade-india-buy-leads-crone-tab", cronKeyGuard, tradeIndiaBuyLeadsCroneTabProvider);
  app.post("/google-sheets-crone-tab", cronKeyGuard, googleSheetsCroneTabProvider);
  app.post("/task-creation-crone-tab/:offset/:limit", cronKeyGuard, taskCreationCroneTabProvider);
  app.post("/task-send-whatsapp-crone-tab", cronKeyGuard, taskSendWhatsappCroneTabProvider);
  app.post("/task-send-email-crone-tab", cronKeyGuard, taskSendEmailCroneTabProvider);
  app.post("/send-due-task-list-mail/:offset/:limit", cronKeyGuard, sendDueTaskListMailProvider);
  app.post("/clear-whatsapp-dispatch-job", cronKeyGuard, clearWhatsappDispatchJobsProvder);
  app.post("/emp-payroll-data-exchange", wharehouseSalesAssignment);
};