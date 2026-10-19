import {
  createAttributeMaster,
  createAttributeValueMaster,
  deleteAttributeMaster,
  deleteAttributeValueMaster,
  getAttributeMasters,
  updateAttributeMaster,
  updateAttributeValueMaster,
} from "../../services/product_settings/productAttributeMasterServices.js";
import callServiceMethod from "../baseController.js";

export const getAttributeMastersController = async (req, res) => {
  await callServiceMethod(req, res, getAttributeMasters(req), "getAttributeMasters");
};
export const createAttributeMasterController = async (req, res) => {
  await callServiceMethod(req, res, createAttributeMaster(req), "createAttributeMaster");
};
export const updateAttributeMasterController = async (req, res) => {
  await callServiceMethod(req, res, updateAttributeMaster(req), "updateAttributeMaster");
};
export const deleteAttributeMasterController = async (req, res) => {
  await callServiceMethod(req, res, deleteAttributeMaster(req), "deleteAttributeMaster");
};
export const createAttributeValueMasterController = async (req, res) => {
  await callServiceMethod(req, res, createAttributeValueMaster(req), "createAttributeValueMaster");
};
export const updateAttributeValueMasterController = async (req, res) => {
  await callServiceMethod(req, res, updateAttributeValueMaster(req), "updateAttributeValueMaster");
};
export const deleteAttributeValueMasterController = async (req, res) => {
  await callServiceMethod(req, res, deleteAttributeValueMaster(req), "deleteAttributeValueMaster");
};
