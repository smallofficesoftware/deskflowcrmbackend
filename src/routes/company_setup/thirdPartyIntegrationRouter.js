import { getExcelSheetAttendance } from "../../controllers/company_setup/thirdPartyIntegration/attendanceImportsController.js";
import { getExcelSheet, getExcelSheetV2 } from "../../controllers/company_setup/thirdPartyIntegration/contactImportsController.js";
import { getGoogleSheetColumns, getGoogleSheetForFacebook, updateGoogleSheetsColumns } from "../../controllers/company_setup/thirdPartyIntegration/googleSheetController.js";
import { indiaMartApi, indiaMartPushApi } from "../../controllers/company_setup/thirdPartyIntegration/indiaMartIntegrationController.js";
import { justdialPushApi } from "../../controllers/company_setup/thirdPartyIntegration/justdialController.js";
import { getExcelSheetPriceListUpdateData } from "../../controllers/company_setup/thirdPartyIntegration/pricelistImportController.js";
import { getExcelSheetProductUpdateData, getExcelSheetProductV2 } from "../../controllers/company_setup/thirdPartyIntegration/productImportsController.js";
import { getExcelSheetTask } from "../../controllers/company_setup/thirdPartyIntegration/taskImportsController.js";
import {
  addPlanRrazorpay,
  getExcelSheetProduct,
  giminiAi,
  verifyPaymentRazorpay
} from "../../controllers/company_setup/thirdPartyIntegration/thirdPartyIntegrationController.js";
import { tradeIndiaApi, tradeIndiaApiBuyLeads } from "../../controllers/company_setup/thirdPartyIntegration/tradeIndiaIntegrationController.js";
import { getPermissionWhatsAppMessage, whatsappSendMessagesWebhook } from "../../controllers/company_setup/thirdPartyIntegration/whatsappIntegrationController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { uploadExcelSheet, uploadExcelSheetPricelist, uploadExcelSheetProduct, uploadExcelSheetTask, } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/India-mart", authenticateToken, tenantMiddleware, indiaMartApi);
  app.post('/webhookindiamart/:companyCode', indiaMartPushApi);
  app.post("/google-sheet-for-facebook", authenticateToken, tenantMiddleware, getGoogleSheetForFacebook);
  app.post("/excel-sheet", authenticateToken, tenantMiddleware, uploadExcelSheet.single("file"), getExcelSheet);
  app.post("/excel-sheet-v2", authenticateToken, tenantMiddleware, uploadExcelSheet.single("file"), getExcelSheetV2);
  app.post("/excel-sheet-product", authenticateToken, tenantMiddleware, uploadExcelSheetProduct.single("file"), getExcelSheetProduct);
  app.post("/excel-sheet-product-v2", authenticateToken, tenantMiddleware, uploadExcelSheetProduct.single("file"), getExcelSheetProductV2);
  app.post("/whatsapp-sender-messages", tenantMiddleware, whatsappSendMessagesWebhook);
  app.post("/whatsapp-messages-rights", getPermissionWhatsAppMessage);
  app.post("/razorpay", addPlanRrazorpay);
  app.post("/verify-payment-razorpay", verifyPaymentRazorpay);
  app.post("/gimini", authenticateToken, tenantMiddleware, giminiAi);
  app.post("/trade-india", authenticateToken, tenantMiddleware, tradeIndiaApi);
  app.post("/trade-india-buy-leads", authenticateToken, tenantMiddleware, tradeIndiaApiBuyLeads);
  app.post("/update-google-sheet-columns", authenticateToken, tenantMiddleware, updateGoogleSheetsColumns);
  app.post("/get-google-sheet-columns", authenticateToken, tenantMiddleware, getGoogleSheetColumns);
  app.post('/webhookjustdial/:companyCode', justdialPushApi);
  app.post("/excel-sheet-task", authenticateToken, tenantMiddleware, uploadExcelSheetTask.single("file"), getExcelSheetTask);
  app.post("/excel-sheet-attendance", authenticateToken, tenantMiddleware, uploadExcelSheetTask.single("file"), getExcelSheetAttendance);
  app.post("/excel-sheet-product-update-data", authenticateToken, tenantMiddleware, uploadExcelSheetProduct.single("file"), getExcelSheetProductUpdateData);
  app.post("/excel-sheet-pricelist-update-data", authenticateToken, tenantMiddleware, uploadExcelSheetPricelist.single("file"), getExcelSheetPriceListUpdateData);

};