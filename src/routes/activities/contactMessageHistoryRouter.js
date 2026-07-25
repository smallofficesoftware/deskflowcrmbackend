import {
  addAttachment,
  allContactsMessageHistory,
  allContactsMessageHistoryDemo,
  pinUnpinContactMessage,
  sendMailMessageHistory
} from "../../controllers/activities/contactMessageHistoryController.js";

import { authenticateToken } from "../../middlewares/auth.js";
import { attachmentUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post(
    "/messageHistory",
    authenticateToken,
    tenantMiddleware,
    allContactsMessageHistory
  );
  app.post(
    "/messageHistoryDemo",
    authenticateToken,
    tenantMiddleware,
    allContactsMessageHistoryDemo
  );

  app.post(
    "/messageAttachmentsUpload",
    attachmentUpload.single("file"),
    authenticateToken,
    tenantMiddleware,
    addAttachment
  );

  app.post(
    "/sendMailToMsg",
    attachmentUpload.single("file"),
    authenticateToken,
    tenantMiddleware,
    sendMailMessageHistory
  );

  app.post("/pinUnpinContactMessage", authenticateToken, tenantMiddleware, pinUnpinContactMessage);
};
