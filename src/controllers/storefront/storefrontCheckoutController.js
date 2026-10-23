import { createStorefrontCheckout } from "../../services/storefront/storefrontCheckoutService.js";
import callServiceMethod from "../baseController.js";

export const createStorefrontCheckoutController = async (req, res) => {
  await callServiceMethod(req, res, createStorefrontCheckout(req), "createStorefrontCheckout");
};
