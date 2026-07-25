import { addAutoAssignmentContactDetail, getAutoAssignmentContactDetail, updateWhatappTemplateIDProvider } from "../../controllers/other_settings/wrkflwAutoAssignmentContactController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/add-auto-assignment-contact-detail", authenticateToken, tenantMiddleware, addAutoAssignmentContactDetail);
    app.post("/get-auto-assignment-contact-detail", authenticateToken, tenantMiddleware, getAutoAssignmentContactDetail);
    app.post("/update-whatsap-template_id", authenticateToken, tenantMiddleware, updateWhatappTemplateIDProvider)
};
