import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import { allBomDataGet, bomDetailsDelete, bomDetailsGet, costingGet, costingRatesGet, costingUpdate, createBomDetails, itemListCreate, itemListDelete, itemListGet, processListCreate, processListDelete, processListsGet, processListUpdate, processMastersCreate, processMastersGet, processMastersUpdate } from "../../services/product_settings/productBillOfMaterialServices.js";
import callServiceMethod from "../baseController.js";

export const bomDetails = async (req, res) => {
    decryptRequestForMultipart(req);
    await callServiceMethod(req, res, createBomDetails(req), "bomDetails");
}

export const getBomDetails = async (req, res) => {
    await callServiceMethod(req, res, bomDetailsGet(req), "bomDetailsGet");
}

export const deleteBomDetails = async (req, res) => {
    await callServiceMethod(req, res, bomDetailsDelete(req), "bomDetailsDelete");
}

export const createProcessMasters = async (req, res) => {
    await callServiceMethod(req, res, processMastersCreate(req), "processMastersCreate");
}

export const updateProcessMasters = async (req, res) => {
    await callServiceMethod(req, res, processMastersUpdate(req), "processMastersUpdate");
}

export const getProcessMasters = async (req, res) => {
    await callServiceMethod(req, res, processMastersGet(req), "processMastersGet");
}

export const createProcessList = async (req, res) => {
    await callServiceMethod(req, res, processListCreate(req), "processListCreate");
}

export const updateProcessList = async (req, res) => {
    await callServiceMethod(req, res, processListUpdate(req), "processListUpdate");
}

export const getProcessLists = async (req, res) => {
    await callServiceMethod(req, res, processListsGet(req), "processListsGet");
}

export const deleteProcessList = async (req, res) => {
    await callServiceMethod(req, res, processListDelete(req), "processListDelete");
}

export const updateCosting = async (req, res) => {
    await callServiceMethod(req, res, costingUpdate(req), "costingUpdate");
}

export const getCosting = async (req, res) => {
    await callServiceMethod(req, res, costingGet(req), "costingGet");
}
export const createItemList = async (req, res) => {
    await callServiceMethod(req, res, itemListCreate(req), "itemListCreate");
}

export const getItemList = async (req, res) => {
    await callServiceMethod(req, res, itemListGet(req), "itemListGet");
}

export const deleteItemList = async (req, res) => {
    await callServiceMethod(req, res, itemListDelete(req), "itemListDelete");
}

export const getCostingRates = async (req, res) => {
    await callServiceMethod(req, res, costingRatesGet(req), "costingRatesGet");
}

export const getAllBomData = async (req, res) => {
    await callServiceMethod(req, res, allBomDataGet(req), "allBomDataGet");
}