import { listContactMappings, saveContactMapping } from "../../services/tally/tallyContactMappingService.js";
import callServiceMethod from "../baseController.js";

export const tallyListContactMappingsProvider = async (req, res) => {
  await callServiceMethod(req, res, listContactMappings(req), "tallyListContactMappings");
};

export const tallySaveContactMappingProvider = async (req, res) => {
  await callServiceMethod(req, res, saveContactMapping(req), "tallySaveContactMapping");
};
