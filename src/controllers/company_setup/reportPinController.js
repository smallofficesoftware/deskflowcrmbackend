import { verifyReportPin } from "../../middlewares/reportPinAuth.js";
import callServiceMethod from "../baseController.js";

export const verifyReportPinController = async (req, res) => {
  await callServiceMethod(req, res, verifyReportPin(req), "verifyReportPin");
};
