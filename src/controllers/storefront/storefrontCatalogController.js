import {
  getStorefrontCategoryBySlug,
  getStorefrontCategoryTree,
  getStorefrontProductBySlug,
  getStorefrontProducts,
} from "../../services/storefront/storefrontCatalogService.js";
import callServiceMethod from "../baseController.js";

export const getStorefrontCategoryTreeController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontCategoryTree(req), "getStorefrontCategoryTree");
};

export const getStorefrontCategoryBySlugController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontCategoryBySlug(req), "getStorefrontCategoryBySlug");
};

export const getStorefrontProductsController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontProducts(req), "getStorefrontProducts");
};

export const getStorefrontProductBySlugController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontProductBySlug(req), "getStorefrontProductBySlug");
};
