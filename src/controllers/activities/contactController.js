import {
  addContact,
  addContactByOnlineStore,
  addContactByQR,
  assignContact,
  assignLableContact,
  assignReadUnreadContact,
  assignSourceContact,
  assignStatusContact,
  checkContactMobileDuplicate,
  contactarchive,
  contactDeleted,
  contactPinUpin,
  contactread,
  contactRecover,
  contactUpdate,
  CreateContactWithReminder,
  fetchContactAddressPrint,
  fetchContactEnvelopePrint,
  generateContactSampleSheet,
  getAllContact,
  getContactByIds,
  getExportsContacts,
  singleContactGet,
  visitingCardReadByGeminiAndInsertDetail
} from "../../services/activities/contactService.js";
import callServiceMethod from "../baseController.js";

export const allContacts = async (req, res) => {
  await callServiceMethod(req, res, getAllContact(req), "allContacts");
};

export const createContact = async (req, res) => {
  await callServiceMethod(req, res, addContact(req), "createContact");
};

export const createContactByQR = async (req, res) => {
  await callServiceMethod(req, res, addContactByQR(req, res), "createContact");
};

export const createContactByOnlineStore = async (req, res) => {
  await callServiceMethod(req, res, addContactByOnlineStore(req, res), "createContact");
};

export const getContactById = async (req, res) => {
  await callServiceMethod(req, res, getContactByIds(req), "getContactById");
};

export const contactAddressPrint = async (req, res) => {
  await callServiceMethod(req, res, fetchContactAddressPrint(req, res), "fetchContactAddressPrint");
};

export const contactEnvelopePrint = async (req, res) => {
  await callServiceMethod(req, res, fetchContactEnvelopePrint(req, res), "fetchContactEnvelopePrint");
};

export const updateContact = async (req, res) => {
  await callServiceMethod(req, res, contactUpdate(req), "updateContact");
};

export const deleteContact = async (req, res) => {
  await callServiceMethod(req, res, contactDeleted(req), "deleteContact");
};

export const recoverContact = async (req, res) => {
  await callServiceMethod(req, res, contactRecover(req), "recoverContact");
};

export const checkContactNumberDuplication = async (req, res) => {
  await callServiceMethod(req, res, checkContactMobileDuplicate(req), "checkContactNumberDuplication");
};

export const singleContactData = async (req, res) => {
  await callServiceMethod(req, res, singleContactGet(req), "singleContactGet");
};

export const pinUnpinContact = async (req, res) => {
  await callServiceMethod(req, res, contactPinUpin(req), "pinUnpinContact");
};
export const readContact = async (req, res) => {
  await callServiceMethod(req, res, contactread(req), "pinUnpinContact");
};
export const archiveContact = async (req, res) => {
  await callServiceMethod(req, res, contactarchive(req), "contactarchive");
};
export const exportsContacts = async (req, res) => {
  await callServiceMethod(req, res, getExportsContacts(req), "allContacts");
};
export const contactWithReminder = async (req, res) => {
  await callServiceMethod(req, res, CreateContactWithReminder(req), "CreateContactWithReminder");
};
export const visitingCardReadInsertContactProvider = async (req, res) => {
  await callServiceMethod(req, res, visitingCardReadByGeminiAndInsertDetail(req), "visitingCardReadInsertContactProvider");
};

export const generateContactSampleSheetProvider = async (req, res) => {
  await callServiceMethod(req, res, generateContactSampleSheet(req), "generateContactSampleSheetProvider");
};

export const assignContactsProvider = async (req, res) => {
  await callServiceMethod(req, res, assignContact(req), "assignContactsProvider");
};

export const assignLableContactsProvider = async (req, res) => {
  await callServiceMethod(req, res, assignLableContact(req), "assignLableContactsProvider");
};

export const assignSourceContactsProvider = async (req, res) => {
  await callServiceMethod(req, res, assignSourceContact(req), "assignSourceContactsProvider");
};

export const assignStatusContactsProvider = async (req, res) => {
  await callServiceMethod(req, res, assignStatusContact(req), "assignStatusContactsProvider");
};

export const assignreadUnreadContactsProvider = async (req, res) => {
  await callServiceMethod(req, res, assignReadUnreadContact(req), "assignreadUnreadContactsProvider");
};
