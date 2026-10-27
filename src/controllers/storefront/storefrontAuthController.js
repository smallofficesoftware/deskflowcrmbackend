import {
  getStorefrontAuthConfig,
  requestGuestChatOtp,
  verifyGuestChatOtp,
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
import { getChatThread, getMyChat, listChatThreads, replyToChat, sendMyChat } from "../../services/storefront/storefrontChatService.js";
import { createMyTicket, getMyTicket, getMyTickets, getTicketCategories, replyMyTicket } from "../../services/storefront/storefrontTicketService.js";
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

export const getStorefrontMyChatController = async (req, res) => {
  await callServiceMethod(req, res, getMyChat(req), "getMyChat");
};
export const sendStorefrontMyChatController = async (req, res) => {
  await callServiceMethod(req, res, sendMyChat(req), "sendMyChat");
};
export const listStorefrontChatThreadsController = async (req, res) => {
  await callServiceMethod(req, res, listChatThreads(req), "listChatThreads");
};
export const getStorefrontChatThreadController = async (req, res) => {
  await callServiceMethod(req, res, getChatThread(req), "getChatThread");
};
export const replyStorefrontChatController = async (req, res) => {
  await callServiceMethod(req, res, replyToChat(req), "replyToChat");
};

export const getStorefrontTicketCategoriesController = async (req, res) => {
  await callServiceMethod(req, res, getTicketCategories(req), "getTicketCategories");
};
export const getStorefrontMyTicketsController = async (req, res) => {
  await callServiceMethod(req, res, getMyTickets(req), "getMyTickets");
};
export const createStorefrontMyTicketController = async (req, res) => {
  await callServiceMethod(req, res, createMyTicket(req), "createMyTicket");
};
export const getStorefrontMyTicketController = async (req, res) => {
  await callServiceMethod(req, res, getMyTicket(req), "getMyTicket");
};
export const replyStorefrontMyTicketController = async (req, res) => {
  await callServiceMethod(req, res, replyMyTicket(req), "replyMyTicket");
};

export const requestGuestChatOtpController = async (req, res) => {
  await callServiceMethod(req, res, requestGuestChatOtp(req), "requestGuestChatOtp");
};
export const verifyGuestChatOtpController = async (req, res) => {
  await callServiceMethod(req, res, verifyGuestChatOtp(req), "verifyGuestChatOtp");
};

export const getStorefrontMeController = async (req, res) => {
  await callServiceMethod(req, res, getStorefrontMe(req), "getStorefrontMe");
};

export const updateStorefrontMeController = async (req, res) => {
  await callServiceMethod(req, res, updateStorefrontMe(req), "updateStorefrontMe");
};
