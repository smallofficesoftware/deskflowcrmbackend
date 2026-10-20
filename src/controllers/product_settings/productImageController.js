import {
  deleteProductImage,
  getProductImages,
  reorderProductImages,
  setPrimaryProductImage,
  uploadProductImage,
} from "../../services/product_settings/productImageServices.js";
import callServiceMethod from "../baseController.js";

export const getProductImagesController = async (req, res) => {
  await callServiceMethod(req, res, getProductImages(req), "getProductImages");
};
export const uploadProductImageController = async (req, res) => {
  await callServiceMethod(req, res, uploadProductImage(req), "uploadProductImage");
};
export const deleteProductImageController = async (req, res) => {
  await callServiceMethod(req, res, deleteProductImage(req), "deleteProductImage");
};
export const setPrimaryProductImageController = async (req, res) => {
  await callServiceMethod(req, res, setPrimaryProductImage(req), "setPrimaryProductImage");
};
export const reorderProductImagesController = async (req, res) => {
  await callServiceMethod(req, res, reorderProductImages(req), "reorderProductImages");
};
