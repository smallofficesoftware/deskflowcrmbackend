import { listProductMappings, saveProductMapping } from "../../services/tally/tallyMappingService.js";
import callServiceMethod from "../baseController.js";

export const tallyListProductMappingsProvider = async (req, res) => {
  await callServiceMethod(req, res, listProductMappings(req), "tallyListProductMappings");
};

export const tallySaveProductMappingProvider = async (req, res) => {
  await callServiceMethod(req, res, saveProductMapping(req), "tallySaveProductMapping");
};
