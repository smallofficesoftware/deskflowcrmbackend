import { listFieldMappings, saveFieldMapping } from "../../services/tally/tallyFieldMappingService.js";
import { listPaymentModeMappings, savePaymentModeMapping } from "../../services/tally/tallyPaymentModeMappingService.js";
import { listTallyDocuments, sendToTally } from "../../services/tally/tallyVoucherService.js";
import callServiceMethod from "../baseController.js";

export const tallySendProvider = async (req, res) => {
  await callServiceMethod(req, res, sendToTally(req), "tallySend");
};

export const tallyDocumentsProvider = async (req, res) => {
  await callServiceMethod(req, res, listTallyDocuments(req), "tallyDocuments");
};

export const tallyListPaymentModeMappingsProvider = async (req, res) => {
  await callServiceMethod(req, res, listPaymentModeMappings(req), "tallyListPaymentModeMappings");
};

export const tallySavePaymentModeMappingProvider = async (req, res) => {
  await callServiceMethod(req, res, savePaymentModeMapping(req), "tallySavePaymentModeMapping");
};

export const tallyListFieldMappingsProvider = async (req, res) => {
  await callServiceMethod(req, res, listFieldMappings(req), "tallyListFieldMappings");
};

export const tallySaveFieldMappingProvider = async (req, res) => {
  await callServiceMethod(req, res, saveFieldMapping(req), "tallySaveFieldMapping");
};
