import callServiceMethod from "../baseController.js";
import {
  cancelExecution,
  deleteFlow,
  duplicateFlow,
  getAutomationSettings,
  getCatalog,
  getExecution,
  getFlow,
  getSample,
  getTemplateList,
  getUsage,
  listExecutions,
  listFlows,
  listenForSample,
  listWebhooks,
  runFlowManually,
  saveAutomationSettings,
  saveFlow,
  testFlow,
  toggleFlow,
  updateWebhook,
  useTemplate,
} from "../../services/automation/flowService.js";
import { handleIncomingWebhook } from "../../services/automation/webhookIn.js";
import logger from "../../utils/logger.js";

const wrap = (fn, name) => async (req, res) => callServiceMethod(req, res, fn(req), name);

export const listFlowsController = wrap(listFlows, "automationListFlows");
export const getFlowController = wrap(getFlow, "automationGetFlow");
export const saveFlowController = wrap(saveFlow, "automationSaveFlow");
export const toggleFlowController = wrap(toggleFlow, "automationToggleFlow");
export const deleteFlowController = wrap(deleteFlow, "automationDeleteFlow");
export const duplicateFlowController = wrap(duplicateFlow, "automationDuplicateFlow");
export const testFlowController = wrap(testFlow, "automationTestFlow");
export const runFlowController = wrap(runFlowManually, "automationRunFlow");
export const listExecutionsController = wrap(listExecutions, "automationListExecutions");
export const getExecutionController = wrap(getExecution, "automationGetExecution");
export const cancelExecutionController = wrap(cancelExecution, "automationCancelExecution");
export const listWebhooksController = wrap(listWebhooks, "automationListWebhooks");
export const listenForSampleController = wrap(listenForSample, "automationListenForSample");
export const getSampleController = wrap(getSample, "automationGetSample");
export const updateWebhookController = wrap(updateWebhook, "automationUpdateWebhook");
export const getSettingsController = wrap(getAutomationSettings, "automationGetSettings");
export const saveSettingsController = wrap(saveAutomationSettings, "automationSaveSettings");
export const getUsageController = wrap(getUsage, "automationGetUsage");
export const listTemplatesController = wrap(getTemplateList, "automationListTemplates");
export const useTemplateController = wrap(useTemplate, "automationUseTemplate");
export const getCatalogController = wrap(getCatalog, "automationGetCatalog");

/**
 * Public incoming webhook. Uses res.status().send() (not res.json) on
 * purpose: the global encryptRequest middleware wraps res.json, and external
 * systems must get a plain response.
 */
export const incomingWebhookController = async (req, res) => {
  try {
    const { status, body } = await handleIncomingWebhook(req);
    res.status(status).send(body);
  } catch (e) {
    logger.error(`[automation] incoming webhook: ${e?.message || e}`);
    res.status(500).send({ ok: false, message: "Internal Server Error" });
  }
};
