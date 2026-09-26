import {
  cancelExecutionController,
  deleteFlowController,
  duplicateFlowController,
  getCatalogController,
  getExecutionController,
  getFlowController,
  getSampleController,
  getSettingsController,
  getUsageController,
  incomingWebhookController,
  listenForSampleController,
  listTemplatesController,
  listExecutionsController,
  listFlowsController,
  listWebhooksController,
  runFlowController,
  saveFlowController,
  saveSettingsController,
  testFlowController,
  toggleFlowController,
  updateWebhookController,
  useTemplateController,
} from "../../controllers/automation/automationController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

// Automations module routes. All POST like the rest of the CRM API.
// The last route is public (no login): the URL token is the credential.
export default (app) => {
  const secured = [authenticateToken, tenantMiddleware];

  app.post("/automation/catalog", ...secured, getCatalogController);
  app.post("/automation/usage", ...secured, getUsageController);
  app.post("/automation/templates/list", ...secured, listTemplatesController);
  app.post("/automation/templates/use", ...secured, useTemplateController);

  app.post("/automation/flows/list", ...secured, listFlowsController);
  app.post("/automation/flows/get", ...secured, getFlowController);
  app.post("/automation/flows/save", ...secured, saveFlowController);
  app.post("/automation/flows/toggle", ...secured, toggleFlowController);
  app.post("/automation/flows/delete", ...secured, deleteFlowController);
  app.post("/automation/flows/duplicate", ...secured, duplicateFlowController);
  app.post("/automation/flows/test", ...secured, testFlowController);
  app.post("/automation/flows/run", ...secured, runFlowController);

  app.post("/automation/executions/list", ...secured, listExecutionsController);
  app.post("/automation/executions/get", ...secured, getExecutionController);
  app.post("/automation/executions/cancel", ...secured, cancelExecutionController);

  app.post("/automation/webhooks/list", ...secured, listWebhooksController);
  app.post("/automation/webhooks/listen", ...secured, listenForSampleController);
  app.post("/automation/webhooks/sample", ...secured, getSampleController);
  app.post("/automation/webhooks/update", ...secured, updateWebhookController);

  app.post("/automation/settings/get", ...secured, getSettingsController);
  app.post("/automation/settings/save", ...secured, saveSettingsController);

  app.all("/automation/hook/:companyId/:token", incomingWebhookController);
};
