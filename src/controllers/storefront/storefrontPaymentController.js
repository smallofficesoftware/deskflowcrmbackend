import { createStorefrontPaymentOrder, verifyStorefrontPayment } from "../../services/storefront/storefrontPaymentService.js";
import callServiceMethod from "../baseController.js";

export const createStorefrontPaymentOrderController = async (req, res) => {
  await callServiceMethod(req, res, createStorefrontPaymentOrder(req), "createStorefrontPaymentOrder");
};

export const verifyStorefrontPaymentController = async (req, res) => {
  await callServiceMethod(req, res, verifyStorefrontPayment(req), "verifyStorefrontPayment");
};
