import { getAllSourceOfTypes } from "../../services/masters/sourceOfTypesServices.js";
import callServiceMethod from "../baseController.js";

export const allSourceOfTypes = async (req, res) => {
  await callServiceMethod(req, res, getAllSourceOfTypes(req), "getAllSourceOfTypes");
};
