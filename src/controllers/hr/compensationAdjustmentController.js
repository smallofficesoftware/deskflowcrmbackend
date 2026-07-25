import { adjustmentTypesFetch, compensationAdjustmentDelete, compensationAdjustmentFetch, compensationAdjustmentInsert, compensationAdjustmentUpdate } from "../../services/hr/compensationAdjustmentServices.js";
import callServiceMethod from "../baseController.js";

export const compensationAdjustmentInsertProvider = async (req, res) => {
    await callServiceMethod(req, res, compensationAdjustmentInsert(req), "compensationAdjustmentInsertProvider");
};
export const compensationAdjustmentFetchProvider = async (req, res) => {
    await callServiceMethod(req, res, compensationAdjustmentFetch(req), "compensationAdjustmentFetchProvider");
};
export const compensationAdjustmentUpdateProvider = async (req, res) => {
    await callServiceMethod(req, res, compensationAdjustmentUpdate(req), "compensationAdjustmentUpdateProvider");
};
export const compensationAdjustmentDeleteProvider = async (req, res) => {
    await callServiceMethod(req, res, compensationAdjustmentDelete(req), "compensationAdjustmentDeleteProvider");
};

export const adjustmentTypesFetchProvider = async (req, res) => {
    await callServiceMethod(req, res, adjustmentTypesFetch(req), "adjustmentTypesFetchProvider");
};
