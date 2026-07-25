import {
  addAttachmentTask,
  allGetTaskHistory,
  completeReminderForTaskMsg
} from "../../controllers/activities/taskMessageHistoryController.js";

import { authenticateToken } from "../../middlewares/auth.js";
import { attachmentUploadTaskChat } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post(
    "/taskMessageHistory",
    authenticateToken,
    tenantMiddleware,
    allGetTaskHistory
  );
  app.post(
    "/completeRemainderTaskMsg",
    authenticateToken,
    tenantMiddleware,
    completeReminderForTaskMsg
  );
//   app.post(
//     "/messageHistoryDemo",
//     authenticateToken,
//     tenantMiddleware,
//     allContactsMessageHistoryDemo
//   );

  app.post(
    "/messageAttachmentsUploadTask",
    attachmentUploadTaskChat.single("file"),
    authenticateToken,
    tenantMiddleware,
    addAttachmentTask
  );

 
//   app.post(
//     "/sendMailToMsg",
//     attachmentUploadTaskChat.single("file"),
//     authenticateToken,
//     tenantMiddleware,
//     sendMailMessageHistory
//   );
};
