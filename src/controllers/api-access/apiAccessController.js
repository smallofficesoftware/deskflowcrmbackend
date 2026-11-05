import { getApiAccessStatus, issueApiKey, revokeApiKey } from "../../services/api-access/apiAccessKeyService.js";
import { listApiCategories } from "../../services/api-access/apiAccessCategoryService.js";
import { listApiProductGroups } from "../../services/api-access/apiAccessProductGroupService.js";
import { listApiProducts } from "../../services/api-access/apiAccessProductService.js";
import { createApiToken } from "../../services/api-access/apiAccessTokenService.js";
import callServiceMethod from "../baseController.js";

export const apiAccessStatusProvider = async (req, res) => {
  await callServiceMethod(req, res, getApiAccessStatus(req), "apiAccessStatusProvider");
};
export const apiAccessIssueKeyProvider = async (req, res) => {
  await callServiceMethod(req, res, issueApiKey(req), "apiAccessIssueKeyProvider");
};
export const apiAccessRevokeKeyProvider = async (req, res) => {
  await callServiceMethod(req, res, revokeApiKey(req), "apiAccessRevokeKeyProvider");
};
export const apiAccessTokenProvider = async (req, res) => {
  await callServiceMethod(req, res, createApiToken(req), "apiAccessTokenProvider");
};
export const apiAccessCategoriesProvider = async (req, res) => {
  await callServiceMethod(req, res, listApiCategories(req), "apiAccessCategoriesProvider");
};
export const apiAccessProductGroupsProvider = async (req, res) => {
  await callServiceMethod(req, res, listApiProductGroups(req), "apiAccessProductGroupsProvider");
};
export const apiAccessProductsProvider = async (req, res) => {
  await callServiceMethod(req, res, listApiProducts(req), "apiAccessProductsProvider");
};
