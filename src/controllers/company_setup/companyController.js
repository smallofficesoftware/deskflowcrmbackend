import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import {
  addContactUsData,
  companyCreate,
  createWorkspace as companyCreateWorkspace,
  companyDelete,
  companyEdit,
  companyImagesGet,
  companyPlaneCreate,
  companyPlanExpireChange,
  companySendOtpForEmail,
  companyUpdate,
  deleteCompanyMain,
  demoBook,
  getAllCategoryb2b,
  getAllCompany,
  getAllCompanyb2b,
  getallSubcategoryb2b,
  getCompanyVsReferralCodeDetail,
  imageSettingsUpdate,
  mailSetupGet,
  mailSetupUpdate,
  moduleSettingsUpdate,
  newCompanyStep,
  paymentDataAdd,
  QRCompany,
  setPrefixGet,
  setPrefixUpdate,
  TeamJoinInnerMain,
  thirdPartyGet,
  thirdPartyUpdate,
  verifyEmailOtpCompany,
  whatsappConfigCreate,
  whatsappConfigGet
} from "../../services/company_setup/companyService.js";
import callServiceMethod from "../baseController.js";

export const allCompany = async (req, res) => {
  await callServiceMethod(req, res, getAllCompany(req), "allCompany");
};

export const JoinTeamMemberInner = async (req, res) => {
  await callServiceMethod(req, res, TeamJoinInnerMain(req), "TeamJoinInnerMain");
};

export const deleteCompany = async (req, res) => {
  await callServiceMethod(req, res, companyDelete(req), "deleteCompany");
};

export const companyQR = async (req, res) => {
  await callServiceMethod(req, res, QRCompany(req), "deleteCompany");
}

export const mainCompanyDelete = async (req, res) => {
  await callServiceMethod(req, res, deleteCompanyMain(req), "MainCompanyDelete")
};

export const otpSendEmailVerifyCompany = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    companySendOtpForEmail(req),
    "otpSendEmailVerifyCompany"
  );
};
export const otpEmailVerificationCompany = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    verifyEmailOtpCompany(req),
    "verifyEmailOtpCompany"
  );
};

export const createCompany = async (req, res) => {
  await callServiceMethod(req, res, companyCreate(req), "createCompany");
};
export const createWorkspace = async (req, res) => {
  await callServiceMethod(req, res, companyCreateWorkspace(req), "createWorkspace");
};
export const createPlane = async (req, res) => {
  await callServiceMethod(req, res, companyPlaneCreate(req), "companyPlaneCreate");
};
export const editCompany = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, companyEdit(req), "editCompany");
};

export const setNewCompany = async (req, res) => {
  await callServiceMethod(req, res, newCompanyStep(req), "setNewCompanyWithNewDb");
};
export const getAllSearchCompanyb2b = async (req, res) => {
  await callServiceMethod(req, res, getAllCompanyb2b(req), "getAllSearchCompanyb2b");

}

export const allCategoryb2b = async (req, res) => {
  await callServiceMethod(req, res, getAllCategoryb2b(req), "allCategory");
};

export const allSubCategoryb2b = async (req, res) => {
  await callServiceMethod(req, res, getallSubcategoryb2b(req), "allSubCategory");
};

export const bookDemo = async (req, res) => {
  await callServiceMethod(req, res, demoBook(req), "bookDemo");
};

export const addContactUs = async (req, res) => {
  await callServiceMethod(req, res, addContactUsData(req), "addContactUs");
}

export const getCompanyReferralCodeDetail = async (req, res) => {
  await callServiceMethod(req, res, getCompanyVsReferralCodeDetail(req), "deleteCompany");
}
export const updateCompanyPlanExpiryDate = async (req, res) => {
  await callServiceMethod(req, res, companyPlanExpireChange(req), "deleteCompany");
}

export const addPaymentHistory = async (req, res) => {
  await callServiceMethod(req, res, paymentDataAdd(req), "paymentDataAdd");
};

export const updateCompanyDetail = async (req, res) => {
  await callServiceMethod(req, res, companyUpdate(req), "companyUpdate");
};

export const updateImageSettings = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, imageSettingsUpdate(req), "imageSettingsUpdate");
};

export const updateModuleSettings = async (req, res) => {
  await callServiceMethod(req, res, moduleSettingsUpdate(req), "moduleSettingsUpdate");
};

export const updateMailSetup = async (req, res) => {
  await callServiceMethod(req, res, mailSetupUpdate(req), "mailSetupUpdate");
};

export const updateSetPrefix = async (req, res) => {
  await callServiceMethod(req, res, setPrefixUpdate(req), "setPrefixUpdate");
};

export const updateThirdParty = async (req, res) => {
  await callServiceMethod(req, res, thirdPartyUpdate(req), "thirdPartyUpdate");
};

export const getThirdParty = async (req, res) => {
  await callServiceMethod(req, res, thirdPartyGet(req), "thirdPartyGet");
};

export const getMailSetup = async (req, res) => {
  await callServiceMethod(req, res, mailSetupGet(req), "mailSetupGet");
};

export const getSetPrefix = async (req, res) => {
  await callServiceMethod(req, res, setPrefixGet(req), "setPrefixGet");
};

export const getCompanyImages = async (req, res) => {
  await callServiceMethod(req, res, companyImagesGet(req), "companyImagesGet");
};

export const createWhatsappConfig = async (req, res) => {
  await callServiceMethod(req, res, whatsappConfigCreate(req), "whatsappConfigCreate");
};

export const getWhatsappConfig = async (req, res) => {
  await callServiceMethod(req, res, whatsappConfigGet(req), "whatsappConfigGet");
};

// export const addPaymentHistory = async (req, res) => {
//   try {
//     const { downloadFlag } = req.body; // Optional: Log or use for conditional logic if needed
//     const result = await paymentDataAdd(req.body, req); // Fixed: Pass req.body as reqBody, req for tenantDB

//     if (result.type === 'pdf') {
//       // Handle PDF download: Stream binary response
//       res.setHeader('Content-Type', result.contentType);
//       res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
//       res.setHeader('Content-Length', result.contentLength);

//       res.send(result.buffer);

//       // Optional: Clean up temp file after send (async-safe, but sync here for simplicity)
//       // fs.unlinkSync(result.filePath); // Add result.filePath to service return if enabling
//       return; // End response here
//     } else if (result.ack === 0) {
//       // Handle errors (400/500) like resBadRequest
//       const statusCode = result.code || 400;
//       return res.status(statusCode).json({
//         ack: 0,
//         code: statusCode,
//         ack_msg: result.ack_msg,
//         developer_msg: result.developer_msg || undefined,
//         data: result.data || []
//       });
//     } else {
//       // Handle success (200) like resSuccess
//       return res.status(200).json({
//         ack: 1,
//         code: 200,
//         data: result.data || {}
//       });
//     }
//   } catch (error) {
//     console.error("Controller Error in addPaymentHistory:", error);
//     return res.status(500).json({
//       ack: 0,
//       code: 500,
//       ack_msg: "Controller Error",
//       developer_msg: error.message || "Unknown Error occurred",
//       data: []
//     });
//   }
// };