import { decryptRequestForMultipart } from "../middlewares/payloadSecurity.js";
import {
  authCheck,
  bulkMailSender,
  commonGetCount,
  createCommon,
  createMainCommon,
  getAllCommon,
  getAllMainCommon,
  updateCommon,
  updateMainCommon
} from "../services/commonServices.js";
import callServiceMethod from "./baseController.js";

export const getCommon = async (req, res) => {
  await callServiceMethod(req, res, getAllCommon(req), "getAllCommon");
};

export const commonCreate = async (req, res) => {
  await callServiceMethod(req, res, createCommon(req), "createCommon");
};

export const commonUpdate = async (req, res) => {
  await callServiceMethod(req, res, updateCommon(req), "updateCommon");
};

export const checkAuth = async (req, res) => {
  await callServiceMethod(req, res, authCheck(req), "authCheck");
};

export const getMainCommon = async (req, res) => {
  await callServiceMethod(req, res, getAllMainCommon(req), "getAllMainCommon");
};

export const mainCommonCreate = async (req, res) => {
  await callServiceMethod(req, res, createMainCommon(req), "createMainCommon");
};

export const mainCommonUpdate = async (req, res) => {
  await callServiceMethod(req, res, updateMainCommon(req), "updateMainCommon");
};

export const commonGetCountProvider = async (req, res) => {
  await callServiceMethod(req, res, commonGetCount(req), "commonGetCount");
};

export const bulkEmailSenderProvider = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, bulkMailSender(req), "bulkEmailSenderProvider");
};