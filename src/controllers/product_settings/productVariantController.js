import {
  createVariantAttribute,
  createVariantAttributeValue,
  deleteVariantAttribute,
  deleteVariantAttributeValue,
  getVariantAttributes,
  getVariants,
  setVariantOptionValues,
} from "../../services/product_settings/productVariantServices.js";
import callServiceMethod from "../baseController.js";

export const getVariantAttributesController = async (req, res) => {
  await callServiceMethod(req, res, getVariantAttributes(req), "getVariantAttributes");
};
export const createVariantAttributeController = async (req, res) => {
  await callServiceMethod(req, res, createVariantAttribute(req), "createVariantAttribute");
};
export const deleteVariantAttributeController = async (req, res) => {
  await callServiceMethod(req, res, deleteVariantAttribute(req), "deleteVariantAttribute");
};
export const createVariantAttributeValueController = async (req, res) => {
  await callServiceMethod(req, res, createVariantAttributeValue(req), "createVariantAttributeValue");
};
export const deleteVariantAttributeValueController = async (req, res) => {
  await callServiceMethod(req, res, deleteVariantAttributeValue(req), "deleteVariantAttributeValue");
};
export const getVariantsController = async (req, res) => {
  await callServiceMethod(req, res, getVariants(req), "getVariants");
};
export const setVariantOptionValuesController = async (req, res) => {
  await callServiceMethod(req, res, setVariantOptionValues(req), "setVariantOptionValues");
};
