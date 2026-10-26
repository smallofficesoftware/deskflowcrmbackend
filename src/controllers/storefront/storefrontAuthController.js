import {
  getStorefrontAuthConfig,
  getStorefrontMe,
  requestStorefrontOtp,
  setStorefrontPin,
  storefrontInviteLogin,
  storefrontLightLogin,
  storefrontPinLogin,
  updateStorefrontMe,
  verifyStorefrontOtp,
} from "../../services/storefront/storefrontAuthService.js";
import { getStorefrontMyOrder, getStorefrontMyOrders, getStorefrontMyTransactions } from "../../services/storefront/storefrontAccountService.js";
import callServiceMethod from "../baseController.js";

export const getStorefrontAuthConfigController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontAuthConfig(req), "getStorefrontAuthConfig");
};

export const requestStorefrontOtpController = async (req, res) => {
  await callServiceMethod(req, res, requestStorefrontOtp(req), "requestStorefrontOtp");
};

export const verifyStorefrontOtpController = async (req, res) => {
  await callServiceMethod(req, res, verifyStorefrontOtp(req), "verifyStorefrontOtp");
};

export const storefrontPinLoginController = async (req, res) => {
  await callServiceMethod(req, res, storefrontPinLogin(req), "storefrontPinLogin");
};

export const storefrontLightLoginController = async (req, res) => {
  await callServiceMethod(req, res, storefrontLightLogin(req), "storefrontLightLogin");
};

export const storefrontInviteLoginController = async (req, res) => {
  await callServiceMethod(req, res, storefrontInviteLogin(req), "storefrontInviteLogin");
};

export const setStorefrontPinController = async (req, res) => {
  await callServiceMethod(req, res, setStorefrontPin(req), "setStorefrontPin");
};

export const getStorefrontMyOrdersController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontMyOrders(req), "getStorefrontMyOrders");
};

export const getStorefrontMyOrderController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontMyOrder(req), "getStorefrontMyOrder");
};

export const getStorefrontMyTransactionsController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontMyTransactions(req), "getStorefrontMyTransactions");
};

export const getStorefrontMeController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontMe(req), "getStorefrontMe");
};

export const updateStorefrontMeController = async (req, res) => {
  await callServiceMethod(req, res, updateStorefrontMe(req), "updateStorefrontMe");
};
