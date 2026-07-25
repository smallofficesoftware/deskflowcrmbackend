import {
  changeNumberOtpSend,
  changeNumberOtpVerify,
  changeProfilePic,
  CreatePlanOtp,
  emailSendOtpVerify,
  emailVerification,
  getAppVersion,
  loginById,
  loginDelete,
  logout,
  otpVerify,
  pageLoad,
  selectWorkspace,
  sendOtpAccountDelete,
  userLogin,
  userRegister
} from "../../controllers/application_login/loginController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";


export default (app) => {
  app.post("/register", userRegister);
  app.post("/login", userLogin);
  app.post("/selectWorkspace", authenticateToken, selectWorkspace);
  app.post("/verifyOtp", otpVerify);
  app.post("/verifyUserOtp", authenticateToken, sendOtpAccountDelete);
  app.post("/loginDelete", authenticateToken, loginDelete);
  app.post("/changeNumberOtpSend", authenticateToken, changeNumberOtpSend);
  app.post("/changeNumberOtpVerify", authenticateToken, changeNumberOtpVerify);
  app.post("/otpSendEmailVerifyLogin", authenticateToken, emailSendOtpVerify);
  app.post("/emailVerification", authenticateToken, emailVerification);

  app.post("/changeProfile", upload, authenticateToken, changeProfilePic);
  app.post("/logout", logout);
  app.post("/onLoad", authenticateToken, tenantMiddleware, pageLoad);
  app.post("/loginId", authenticateToken, loginById);
  app.post("/call-helper-version", getAppVersion)
  app.post("/plan-create-otp", CreatePlanOtp)
};
