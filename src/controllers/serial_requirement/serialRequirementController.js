import {
  getSerialRequirement,
  lookupSerialNumber,
} from "../../services/serial_requirement/serialRequirementServices.js";
import callServiceMethod from "../baseController.js";

export const serialRequirement = async (req, res) => {
  await callServiceMethod(req, res, getSerialRequirement(req), "serialRequirement");
};

export const serialLookup = async (req, res) => {
  await callServiceMethod(req, res, lookupSerialNumber(req), "serialLookup");
};
