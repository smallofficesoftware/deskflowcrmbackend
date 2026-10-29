import callServiceMethod from "../baseController.js";
import { removeStorefrontLogo, uploadStorefrontLogo } from "../../services/storefront/storefrontLogoService.js";

export const uploadStorefrontLogoController = async (req, res) => {
  await callServiceMethod(req, res, uploadStorefrontLogo(req), "uploadStorefrontLogo");
};

export const removeStorefrontLogoController = async (req, res) => {
  await callServiceMethod(req, res, removeStorefrontLogo(req), "removeStorefrontLogo");
};
