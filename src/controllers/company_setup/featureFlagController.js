import { getFeatureFlag, setFeatureFlag } from "../../services/company_setup/featureFlagServices.js";
import callServiceMethod from "../baseController.js";

export const setFeatureFlagController = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    setFeatureFlag(req),
    "setFeatureFlag"
  );
};

export const getFeatureFlagController = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getFeatureFlag(req),
    "getFeatureFlag"
  );
};
