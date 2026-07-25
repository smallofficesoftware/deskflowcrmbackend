import { deleteStockAdjustment, getAllStockData, getStockAdjustment, inserStockAdjustment, warehouseWiseItemStock } from "../../services/activities/stockAdjustmentServices.js";
import callServiceMethod from "../baseController.js";

export const inserStockAdjustmentProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        inserStockAdjustment(req, res),
        "inserStockAdjustment"
    );
};

export const getStockAdjustmentListProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getStockAdjustment(req, res),
        "getStockAdjustment"
    );
};
export const deleteStockAdjustmentDeleteProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        deleteStockAdjustment(req, res),
        "deleteStockAdjustment"
    );
};
export const warehouseWiseItemStockProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        warehouseWiseItemStock(req, res),
        "warehouseWiseItemStock"
    );
};
export const getAllStockDataProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getAllStockData(req, res),
        "getAllStockData"
    );
};