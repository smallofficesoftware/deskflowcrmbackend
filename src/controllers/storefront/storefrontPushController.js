import callServiceMethod from "../baseController.js";
import { getStorefrontPushKey, subscribeStorefrontPush, unsubscribeStorefrontPush } from "../../services/storefront/storefrontPushService.js";

export const getStorefrontPushKeyController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontPushKey(req), "getStorefrontPushKey");
};

export const subscribeStorefrontPushController = async (req, res) => {
  await callServiceMethod(req, res, subscribeStorefrontPush(req), "subscribeStorefrontPush");
};

export const unsubscribeStorefrontPushController = async (req, res) => {
  await callServiceMethod(req, res, unsubscribeStorefrontPush(req), "unsubscribeStorefrontPush");
};
