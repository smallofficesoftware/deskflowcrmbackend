import { campaignSenderProvider, campaignUploadMediaProvider, generateCampaignExcelProvider } from "../../controllers/whatsapp/campaignController.js";
import { accWvFetchProvider, deletewhatsappTemplateConfig, getwhatsappTemplateConfig, ordWvFetchProvider, sendContactAllAccountPdfWhatsappProvider, sendSalesPdfWhatsappProvider, sendSingleAccountPdfWhatsappProvider, waCloudHookProvider, wconfigFlagProvider } from "../../controllers/whatsapp/whatsappController.js";
import { fetchWhatsappTemplateProvider, fetchWhatsappWABAConfigDetails, fetchWhatsappWABAConfigDetailsTeam, sendViaSavedConfig, sendWhatsappTemplateProvider, whatsappTemplateConfigsProvider, whatsappTemplateConfigsUpdateProvider, whatsappTemplateUploadAttachmentProvider } from "../../controllers/whatsapp/whatsappTemplateController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { campaignAttachment, whatsappTemplateAttachment } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/send-sales-pdf-whatsapp", authenticateToken, tenantMiddleware, sendSalesPdfWhatsappProvider);
    app.post("/send-contact-all-account-pdf-whatsapp", authenticateToken, tenantMiddleware, sendContactAllAccountPdfWhatsappProvider);
    app.post("/send-single-account-pdf-whatsapp", authenticateToken, tenantMiddleware, sendSingleAccountPdfWhatsappProvider);
    app.post("/wconfigflag/", authenticateToken, tenantMiddleware, wconfigFlagProvider);

    // For Frontend/Backend Side Fetching Dynamic Variable 
    app.post("/ord-wvfetch/:orderId{/:fetchType}", authenticateToken, tenantMiddleware, ordWvFetchProvider);
    app.post("/acc-wvfetch/:acc_id{/:fetchType}", authenticateToken, tenantMiddleware, accWvFetchProvider);

    // For Whatsapp Template
    app.post("/get-whatsapp-template-config", authenticateToken, tenantMiddleware, getwhatsappTemplateConfig);
    app.post("/delete-whatsapp-template-config", authenticateToken, tenantMiddleware, deletewhatsappTemplateConfig);

    // For Campaign
    app.post("/campaign/generate-excel", authenticateToken, tenantMiddleware, generateCampaignExcelProvider);
    app.post("/campaign/send", authenticateToken, tenantMiddleware, campaignSenderProvider);
    app.post("/campaign/upload-media", authenticateToken, tenantMiddleware, campaignAttachment.single("file"), campaignUploadMediaProvider);

    // For Template Configuration
    app.get("/whatsapp-templates/saved-config", authenticateToken, tenantMiddleware, whatsappTemplateConfigsProvider);
    app.post("/whatsapp-templates/saved-config", authenticateToken, tenantMiddleware, whatsappTemplateConfigsUpdateProvider);
    app.post("/get-whatsapp-template", authenticateToken, tenantMiddleware, fetchWhatsappTemplateProvider);
    app.post("/send-whatsapp-template", authenticateToken, tenantMiddleware, sendWhatsappTemplateProvider);

    app.post("/get-whatsapp-waba-config-details", authenticateToken, tenantMiddleware, fetchWhatsappWABAConfigDetails);

    app.post("/get-whatsapp-waba-config-details-team", authenticateToken, tenantMiddleware, fetchWhatsappWABAConfigDetailsTeam);

    app.post("/whatsapp-templates/send-via-config", authenticateToken, tenantMiddleware, sendViaSavedConfig);
    app.post("/whatsapp-templates/upload-attachment", authenticateToken, tenantMiddleware, whatsappTemplateAttachment.single("file"), whatsappTemplateUploadAttachmentProvider);

    // For Webhhok
    app.post('/wacloudhook/:companyCode', waCloudHookProvider);
};