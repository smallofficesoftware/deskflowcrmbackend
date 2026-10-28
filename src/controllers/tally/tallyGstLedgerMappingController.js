import { listGstLedgerMappings, saveGstLedgerMapping } from "../../services/tally/tallyGstLedgerMappingService.js";
import callServiceMethod from "../baseController.js";

export const tallyListGstLedgerMappingsProvider = async (req, res) => {
  await callServiceMethod(req, res, listGstLedgerMappings(req), "tallyListGstLedgerMappings");
};

export const tallySaveGstLedgerMappingProvider = async (req, res) => {
  await callServiceMethod(req, res, saveGstLedgerMapping(req), "tallySaveGstLedgerMapping");
};
