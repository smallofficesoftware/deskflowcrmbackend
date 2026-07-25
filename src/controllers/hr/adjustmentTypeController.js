import { adjustmentTypesAdd, adjustmentTypesGet, adjustmentTypesUpdate } from "../../services/hr/adjustmentTypeServices.js";
import callServiceMethod from "../baseController.js";

export const getAdjustmentTypes = async (req, res) => {
    await callServiceMethod(req, res, adjustmentTypesGet(req), "adjustmentTypesGet");
};

export const addAdjustmentTypes = async (req, res) => {
    await callServiceMethod(req, res, adjustmentTypesAdd(req), "adjustmentTypesAdd");
};

export const updateAdjustmentTypes = async (req, res) => {
    await callServiceMethod(req, res, adjustmentTypesUpdate(req), "adjustmentTypesUpdate");
};