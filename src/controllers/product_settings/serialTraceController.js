import { SerialNumberTrace } from "../../services/product_settings/serialTraceService.js";
import callServiceMethod from "../baseController.js";

export const getSerialNumberTrace = async (req, res) => {
  await callServiceMethod(req, res, SerialNumberTrace(req), "getSerialNumberTrace");
};
