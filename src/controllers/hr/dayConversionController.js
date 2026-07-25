import { adjustmentAdd, adjustmentGet, adjustmentUpdate } from "../../services/hr/dayConversionServices.js";
import callServiceMethod from "../baseController.js";

export const addAdjustment = async (req, res) => {
    await callServiceMethod(req, res, adjustmentAdd(req), "adjustmentAdd");
};

export const getAdjustment = async (req, res) => {
    await callServiceMethod(req, res, adjustmentGet(req), "adjustmentGet");
};

export const updateAdjustment = async (req, res) => {
    await callServiceMethod(req, res, adjustmentUpdate(req), "adjustmentUpdate");
};