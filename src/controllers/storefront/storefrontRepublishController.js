import callServiceMethod from "../baseController.js";
import { republishStorefront } from "../../services/storefront/storefrontRepublishService.js";

export const republishStorefrontController = async (req, res) => {
  await callServiceMethod(req, res, republishStorefront(req), "republishStorefront");
};
