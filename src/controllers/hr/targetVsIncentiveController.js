import { getAllTargetVsIncentives } from "../../services/hr/targetVsIncentiveServices.js";
import callServiceMethod from "../baseController.js";

export const allTargetVsIncentives = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllTargetVsIncentives(req),
    "getAllTargetVsIncentives"
  );
};
