import { getAllProducts, getPriceLists, getProductCategories, orderCreateByOnlineStore } from "../../services/online-store/onlineStoreService.js";
import callServiceMethod from "../baseController.js";

export const createOrderByOnlineStore = async (req, res) => {
    await callServiceMethod(req, res, orderCreateByOnlineStore(req), "getAllSourceOfTypes");
};

export const getProductCategory = async (req, res) => {
    await callServiceMethod(req, res, getProductCategories(req), "getProductCategory");
}

export const getProducts = async (req, res) => {
    await callServiceMethod(req, res, getAllProducts(req), "getProducts");
}

export const getAllPriceLists = async (req, res) => {
    await callServiceMethod(req, res, getPriceLists(req), "getPriceLists");
}