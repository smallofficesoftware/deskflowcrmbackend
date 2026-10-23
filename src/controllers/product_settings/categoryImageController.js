import { deleteCategoryImage, uploadCategoryImage } from "../../services/product_settings/categoryImageServices.js";
import callServiceMethod from "../baseController.js";

export const uploadCategoryImageController = async (req, res) => {
  await callServiceMethod(req, res, uploadCategoryImage(req), "uploadCategoryImage");
};

export const deleteCategoryImageController = async (req, res) => {
  await callServiceMethod(req, res, deleteCategoryImage(req), "deleteCategoryImage");
};
