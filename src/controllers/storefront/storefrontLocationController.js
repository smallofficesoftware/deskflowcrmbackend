import {
  getStorefrontAreas,
  getStorefrontCities,
  getStorefrontCountries,
  getStorefrontStates,
} from "../../services/storefront/storefrontLocationService.js";
import callServiceMethod from "../baseController.js";

export const getStorefrontCountriesController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontCountries(req), "getStorefrontCountries");
};

export const getStorefrontStatesController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontStates(req), "getStorefrontStates");
};

export const getStorefrontCitiesController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontCities(req), "getStorefrontCities");
};

export const getStorefrontAreasController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontAreas(req), "getStorefrontAreas");
};
