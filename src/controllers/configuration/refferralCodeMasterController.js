import callServiceMethod from "./baseController.js";
import {referralCodeVerify , referralCodeVerifyFromCompany} from '../services/refferralCodeMasterService.js'
export const verifyActivationCode = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    referralCodeVerify(req),
    "referralCodeVerify"
  );
};
export const verifyActivationCodeCompany = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    referralCodeVerifyFromCompany(req),
    "referralCodeVerifyFromCompany"
  );
};
