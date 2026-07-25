
import {
    createBillOfMaterials,
    deleteBillOfMaterials,
    getBillOfMaterials,
    updateBillOfMaterials
} from "../../services/masters/billOfmaterialService.js";
import callServiceMethod from "../baseController.js";

export const billOfMaterialsCreate = async (req, res) => {
    await callServiceMethod(req, res, createBillOfMaterials(req), "billOfMaterialsCreate");
};
export const getBom = async (req, res) => {
    await callServiceMethod(req, res, getBillOfMaterials(req), "getBillOfMaterials");
};
export const updateBillOfMaterialsCreate = async (req, res) => {
    await callServiceMethod(req, res, updateBillOfMaterials(req), "billOfMaterialsCreate");
};
export const deleteBillOfMaterialsCreate = async (req, res) => {
    await callServiceMethod(req, res, deleteBillOfMaterials(req), "billOfMaterialsCreate");
};