import {
  b2ballProductgetAllProduct,
  DeleteProducts,
  generateProductSampleSheet,
  getAllProduct,
  getExportsProducts,
  getExportsProductsForUpdateData,
  productCreate,
  productStockMovement,
  productUpdate,
  setProductDesignerPage,
  SerialNumberWiseStockCheck
} from "../../services/product_settings/productServices.js";
import callServiceMethod from "../baseController.js";

import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";

export const allProduct = async (req, res) => {
  await callServiceMethod(req, res, getAllProduct(req), "allProduct");
};
export const b2ballProduct = async (req, res) => {
  await callServiceMethod(req, res, b2ballProductgetAllProduct(req), "allProduct");
};

export const createProduct = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, productCreate(req), "createProduct");
};
export const updateProduct = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, productUpdate(req), "updateProduct");
};

export const saveProductDesignerPage = async (req, res) => {
  await callServiceMethod(req, res, setProductDesignerPage(req), "setProductDesignerPage");
};

export const getProductStockMovement = async (req, res) => {
  await callServiceMethod(req, res, productStockMovement(req), "getProductStockMovement");

}
export const getSerialNumberStock = async (req, res) => {
  await callServiceMethod(req, res, SerialNumberWiseStockCheck(req), "getSerialNumberStock");

}

export const DeleteProduct = async (req, res) => {
  await callServiceMethod(req, res, DeleteProducts(req), "DeleteProduct");
}

export const generateProductSampleSheetProvider = async (req, res) => {
  await callServiceMethod(req, res, generateProductSampleSheet(req), "generateProductSampleSheetProvider");
};
export const exportsProducts = async (req, res) => {
  await callServiceMethod(req, res, getExportsProducts(req), "exportsProducts");
};
export const exportsProductsForUpdateData = async (req, res) => {
  await callServiceMethod(req, res, getExportsProductsForUpdateData(req), "exportsProductsForUpdateData");
};