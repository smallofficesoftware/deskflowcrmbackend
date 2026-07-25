import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import {
  AppVersionGet,
  changePicProfile,
  chooseWorkspace,
  getLoginById,
  loginUser,
  logOutUser,
  onLoad,
  otpSendChangeNumber,
  otpSendEmailOrNumberDeleteAccount,
  otpSendEmailVerifyProfile,
  PlanCreateOtp,
  registerUser,
  verifyEmailProfile,
  verifyOtp,
  verifyOtpForChangeNumber,
  verifyOtpForDeleteAccount
} from "../../services/application_login/loginService.js";
import callServiceMethod from "../baseController.js";

export const userRegister = async (req, res) => {
  await callServiceMethod(req, res, registerUser(req), "userRegister");
};

export const userLogin = async (req, res) => {
  await callServiceMethod(req, res, loginUser(req, res), "userLogin");
};
export const CreatePlanOtp = async (req, res) => {
  await callServiceMethod(req, res, PlanCreateOtp(req, res), "PlanCreateOtp");
};
export const changeProfilePic = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(
    req,
    res,
    changePicProfile(req, res),
    "changeProfilePic"
  );
};

export const otpVerify = async (req, res) => {
  await callServiceMethod(req, res, verifyOtp(req, res), "verifyOtp");
};
export const sendOtpAccountDelete = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    otpSendEmailOrNumberDeleteAccount(req, res),
    "otpEmailOrNumberForDelete"
  );
};
export const loginDelete = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    verifyOtpForDeleteAccount(req, res),
    "verifyOtpForDeleteAccount"
  );
};

export const changeNumberOtpSend = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    otpSendChangeNumber(req, res),
    "otpSendChangeNumber"
  );
};
export const changeNumberOtpVerify = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    verifyOtpForChangeNumber(req, res),
    "verifyOtpForChangeNumber"
  );
};
export const emailSendOtpVerify = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    otpSendEmailVerifyProfile(req, res),
    "emailSendOtpVerify"
  );
};
export const emailVerification = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    verifyEmailProfile(req, res),
    "emailVerificationForProfile"
  );
};
export const pageLoad = async (req, res) => {
  await callServiceMethod(req, res, onLoad(req, res), "pageLoad");
};

export const loginById = async (req, res) => {
  await callServiceMethod(req, res, getLoginById(req, res), "LoginById");
};

export const logout = async (req, res) => {
  await callServiceMethod(req, res, logOutUser(req, res), "logOutUser");
};
export const getAppVersion = async (req, res) => {
  await callServiceMethod(req, res, AppVersionGet(req, res), "AppVersionGet");
};

export const selectWorkspace = async (req, res) => {
  await callServiceMethod(req, res, chooseWorkspace(req, res), "chooseWorkspace");
};

