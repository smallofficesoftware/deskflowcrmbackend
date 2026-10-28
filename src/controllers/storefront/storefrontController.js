import { getStorefrontDomain, resolveStorefrontDomain, saveStorefrontDomain, verifyStorefrontDomain } from "../../services/storefront/storefrontDomainService.js";
import { getStorefrontSettings, removeStorefrontFavicon, saveStorefrontSettings, uploadStorefrontFavicon } from "../../services/storefront/storefrontSettingsService.js";
import { getStorefrontThemes, selectStorefrontTheme } from "../../services/storefront/storefrontThemeService.js";
import { getLockedAccounts, unlockStorefrontAccount } from "../../services/storefront/storefrontModeSwitch.js";
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

export const getLockedAccountsController = async (req, res) => {
  await callServiceMethod(req, res, getLockedAccounts(req), "getLockedAccounts");
};

export const unlockStorefrontAccountController = async (req, res) => {
  await callServiceMethod(req, res, unlockStorefrontAccount(req), "unlockStorefrontAccount");
};

export const getStorefrontDomainController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontDomain(req), "getStorefrontDomain");
};

export const saveStorefrontDomainController = async (req, res) => {
  await callServiceMethod(req, res, saveStorefrontDomain(req), "saveStorefrontDomain");
};

export const verifyStorefrontDomainController = async (req, res) => {
  await callServiceMethod(req, res, verifyStorefrontDomain(req), "verifyStorefrontDomain");
};

export const resolveStorefrontDomainController = async (req, res) => {
  await callServiceMethod(req, res, resolveStorefrontDomain(req), "resolveStorefrontDomain");
};

export const uploadStorefrontFaviconController = async (req, res) => {
  await callServiceMethod(req, res, uploadStorefrontFavicon(req), "uploadStorefrontFavicon");
};

export const removeStorefrontFaviconController = async (req, res) => {
  await callServiceMethod(req, res, removeStorefrontFavicon(req), "removeStorefrontFavicon");
};
