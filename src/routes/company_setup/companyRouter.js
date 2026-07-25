import {
  addContactUs,
  addPaymentHistory,
  allCategoryb2b,
  allCompany,
  allSubCategoryb2b,
  bookDemo,
  companyQR,
  createCompany,
  createPlane,
  createWhatsappConfig,
  createWorkspace,
  deleteCompany,
  editCompany,
  getAllSearchCompanyb2b,
  getCompanyImages,
  getCompanyReferralCodeDetail,
  getMailSetup,
  getSetPrefix,
  getThirdParty,
  getWhatsappConfig,
  JoinTeamMemberInner,
  mainCompanyDelete,
  otpEmailVerificationCompany,
  otpSendEmailVerifyCompany,
  setNewCompany,
  updateCompanyDetail,
  updateCompanyPlanExpiryDate,
  updateImageSettings,
  updateMailSetup,
  updateModuleSettings,
  updateSetPrefix,
  updateThirdParty
} from "../../controllers/company_setup/companyController.js";
import { authenticateToken, publicAuthenticateToken } from "../../middlewares/auth.js";
import { companyUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/company", authenticateToken, allCompany);
  app.post("/createCompany", createCompany);
  app.post("/createWorkspace", authenticateToken, createWorkspace);
  app.post("/createPlane", createPlane);
  app.post("/step-company", setNewCompany);
  app.post("/companyQR", authenticateToken, companyQR);
  app.post("/getAll-Search-Company-b2b", publicAuthenticateToken, getAllSearchCompanyb2b);
  app.post(
    "/editCompany",
    authenticateToken,
    companyUpload.fields([{ name: "header_img" }, { name: "footer_img" }, { name: "company_logo" }, { name: "catalog_pdf" }, { name: "company_sign" }, { name: "banner_img_one" }, { name: "banner_img_two" }]),
    editCompany
  );
  app.post("/companyDelete", authenticateToken, deleteCompany);
  app.post("/mainCompanyDelete", authenticateToken, mainCompanyDelete);
  app.post(
    "/otpSendEmailVerifyCompany",
    authenticateToken,
    otpSendEmailVerifyCompany
  );
  app.post(
    "/otpEmailVerificationCompany",
    authenticateToken,
    otpEmailVerificationCompany
  );
  app.post("/category-b2b", allCategoryb2b);
  app.post("/subCategory-b2b", allSubCategoryb2b);
  app.post("/book-demo", bookDemo);
  app.post("/addContactDetail", addContactUs);
  app.post("/getCompanyVsReferralCode", getCompanyReferralCodeDetail);
  app.post("/update-plan-expiry", updateCompanyPlanExpiryDate);
  app.post("/inner-join-team", authenticateToken, tenantMiddleware, JoinTeamMemberInner);
  app.post("/PaymentHistory", addPaymentHistory);
  app.post("/update-company-detail", authenticateToken, updateCompanyDetail);
  app.post("/update-image-settings", authenticateToken, companyUpload.fields([{ name: "header_img" }, { name: "footer_img" }, { name: "company_logo" }, { name: "catalog_pdf" }, { name: "company_sign" }, { name: "banner_img_one" }, { name: "banner_img_two" }]), updateImageSettings);
  app.post("/update-module-settings", authenticateToken, updateModuleSettings);
  app.post("/update-mail-setup", authenticateToken, updateMailSetup);
  app.post("/update-set-prefix", authenticateToken, updateSetPrefix);
  app.post("/update-third-party", authenticateToken, updateThirdParty);
  app.post("/get-third-party-data", authenticateToken, getThirdParty);
  app.post("/get-mail-setup-data", authenticateToken, getMailSetup);
  app.post("/get-set-prefix-data", authenticateToken, getSetPrefix);
  app.post("/get-company-logo-images", getCompanyImages);

  app.post("/create-whatsapp-config", authenticateToken, tenantMiddleware, createWhatsappConfig);
  app.post("/get-whatsapp-config", authenticateToken, tenantMiddleware, getWhatsappConfig);
};