import {
  allContacts,
  archiveContact,
  assignContactsProvider,
  assignLableContactsProvider,
  assignreadUnreadContactsProvider,
  assignSourceContactsProvider,
  assignStatusContactsProvider,
  checkContactNumberDuplication,
  contactAddressPrint,
  contactEnvelopePrint,
  contactWithReminder,
  createContact,
  createContactByOnlineStore,
  createContactByQR,
  deleteContact,
  exportsContacts,
  generateContactSampleSheetProvider,
  getContactById,
  pinUnpinContact,
  readContact,
  recoverContact,
  singleContactData,
  visitingCardReadInsertContactProvider
} from "../../controllers/activities/contactController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { visitingCard } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/Contact", authenticateToken, tenantMiddleware, allContacts);
  app.post("/createContact", authenticateToken, tenantMiddleware, createContact);
  app.post("/createContactByQR/:qrcode", createContactByQR)
  app.post("/createContactByOnlineStore/:qrcode", createContactByOnlineStore)
  app.post("/singleContactData", authenticateToken, tenantMiddleware, singleContactData);
  app.post("/deleteContact", authenticateToken, tenantMiddleware, deleteContact);
  app.post("/recoverContact", authenticateToken, tenantMiddleware, recoverContact);
  app.post("/checkNumberDuplication", authenticateToken, tenantMiddleware, checkContactNumberDuplication);
  app.post("/pinUnpinContact", authenticateToken, tenantMiddleware, pinUnpinContact);
  app.post("/readContact", authenticateToken, tenantMiddleware, readContact);
  app.post("/ArchiveContact", authenticateToken, tenantMiddleware, archiveContact);
  app.post("/export-contact", authenticateToken, tenantMiddleware, exportsContacts);
  app.post("/contact-with-reminder", authenticateToken, tenantMiddleware, contactWithReminder);
  app.post("/getContactById", authenticateToken, tenantMiddleware, getContactById);
  app.post("/contact-address-pdf", authenticateToken, tenantMiddleware, contactAddressPrint);
  app.post("/contact-envelope-pdf", authenticateToken, tenantMiddleware, contactEnvelopePrint);
  app.post(
    "/read-visiting-card",
    authenticateToken,
    visitingCard.fields([
      { name: 'front', maxCount: 1 },
      { name: 'back', maxCount: 1 },
    ]),
    tenantMiddleware,
    visitingCardReadInsertContactProvider
  );
  app.post("/generate-contact-sample-sheet", authenticateToken, tenantMiddleware, generateContactSampleSheetProvider);
  app.post("/assign-contact", authenticateToken, tenantMiddleware, assignContactsProvider);
  app.post("/assign-lable", authenticateToken, tenantMiddleware, assignLableContactsProvider);
  app.post("/assign-source", authenticateToken, tenantMiddleware, assignSourceContactsProvider);
  app.post("/assign-status", authenticateToken, tenantMiddleware, assignStatusContactsProvider);
  app.post("/readunread-contact", authenticateToken, tenantMiddleware, assignreadUnreadContactsProvider);
};