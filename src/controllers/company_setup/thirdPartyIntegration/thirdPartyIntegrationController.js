import { decryptRequestForMultipart } from "../../../middlewares/payloadSecurity.js";
import {
  addPlanByRrazorpay,
  addProductByExcelSheet,
  giminiAiChatAPI,
  messageMailSend,
  razorpayPaymentVerify
} from "../../../services/company_setup/thirdPartyIntegrationService.js";

import callServiceMethod from "../../baseController.js";

export const getExcelSheetProduct = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(
    req,
    res,
    addProductByExcelSheet(req),
    "getExcelSheetProduct"
  );
};

export const addPlanRrazorpay = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    addPlanByRrazorpay(req),
    "addPlanRrazorpay"
  );
};
export const verifyPaymentRazorpay = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    razorpayPaymentVerify(req),
    "verifyPaymentOfRazorpay"
  );
};
export const sendMailMessage = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    messageMailSend(req),
    "sendMailMessage"
  );
};
export const giminiAi = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    giminiAiChatAPI(req),
    "giminiAi"
  );
};

