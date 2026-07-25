import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import { activationCodeVerify, activationCodeVerifyFromCompany } from '../../services/configuration/activationCodeMasterServices.js';
import callServiceMethod from "../baseController.js";
export const verifyActivationCode = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(
    req,
    res,
    activationCodeVerify(req),
    "activationCodeVerify"
  );
};
export const verifyActivationCodeCompany = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    activationCodeVerifyFromCompany(req),
    "verifyActivationCodeCompany"
  );
};
