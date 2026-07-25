import { roundOffGet, roundOffUpdate } from "../../services/hr/roundOfServices.js";
import callServiceMethod from "../baseController.js";

export const getRoundOff = async (req, res) => {
    await callServiceMethod(req, res, roundOffGet(req), "roundOffGet");
};

export const updateRoundOff = async (req, res) => {
    await callServiceMethod(req, res, roundOffUpdate(req), "roundOffUpdate");
};