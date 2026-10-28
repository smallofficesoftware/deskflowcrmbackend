import { listVoucherTypeMappings, saveVoucherTypeMapping } from "../../services/tally/tallyVoucherTypeMappingService.js";
import callServiceMethod from "../baseController.js";

export const tallyListVoucherTypeMappingsProvider = async (req, res) => {
  await callServiceMethod(req, res, listVoucherTypeMappings(req), "tallyListVoucherTypeMappings");
};

export const tallySaveVoucherTypeMappingProvider = async (req, res) => {
  await callServiceMethod(req, res, saveVoucherTypeMapping(req), "tallySaveVoucherTypeMapping");
};
