import {
    getAllProduct,
    productUnitDeleteAll
} from "../../services/product_settings/productUnitServices.js";
import callServiceMethod from "../baseController.js";


export const allProduct = async (req, res) => {
    await callServiceMethod(req, res, getAllProduct(req), "allProduct");
};
export const productUnitDelete = async (req, res) => {
    await callServiceMethod(req, res, productUnitDeleteAll(req), "productUnitDeleteAll");
};
