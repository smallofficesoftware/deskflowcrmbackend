import { getStorefrontSettings, saveStorefrontSettings } from "../../services/storefront/storefrontSettingsService.js";
import { getStorefrontThemes, selectStorefrontTheme } from "../../services/storefront/storefrontThemeService.js";
import callServiceMethod from "../baseController.js";

export const getStorefrontSettingsController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontSettings(req), "getStorefrontSettings");
};

export const saveStorefrontSettingsController = async (req, res) => {
  await callServiceMethod(req, res, saveStorefrontSettings(req), "saveStorefrontSettings");
};

export const getStorefrontThemesController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontThemes(req), "getStorefrontThemes");
};

export const selectStorefrontThemeController = async (req, res) => {
  await callServiceMethod(req, res, selectStorefrontTheme(req), "selectStorefrontTheme");
};
