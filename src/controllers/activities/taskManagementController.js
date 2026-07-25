import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import { AllSupportTicketCategory, AllSupportTicketGet, AllTaskCountGet, AllTaskDelete, AllTaskGet, AllTaskUpdate, archiveTasks, assignReadUnreadTask, completeStickeyNote, convertSupportTicketToTasks, createAllTask, createCustomerSupportTicket, createStickeyNote, deleteStickeyNote, editStickeyNote, generateTaskSampleSheet, getStickeyNotesData, supportTicketMessageCreate, supportTicketMessageGet, taskCategoryGet, unarchiveTasks, widgetAdd } from "../../services/activities/taskManagementServices.js";
import callServiceMethod from "../baseController.js";

export const AllTask = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, createAllTask(req), "createAllTask");
};

export const getAllTask = async (req, res) => {
  await callServiceMethod(req, res, AllTaskGet(req), "AllTaskGet");
};

export const updateAllTask = async (req, res) => {
  decryptRequestForMultipart(req);

  await callServiceMethod(req, res, AllTaskUpdate(req), "AllTaskUpdate");
};

export const deleteAllTask = async (req, res) => {
  await callServiceMethod(req, res, AllTaskDelete(req), "AllTaskDelete");
};

export const getTaskCount = async (req, res) => {
  await callServiceMethod(req, res, AllTaskCountGet(req), "AllTaskCountGet");
};

export const archiveAllTask = async (req, res) => {
  await callServiceMethod(req, res, archiveTasks(req), "archiveAllTask");
};
export const unarchiveAllTask = async (req, res) => {
  await callServiceMethod(req, res, unarchiveTasks(req), "unarchiveAllTask");
};
export const convertSupportTicketAllTask = async (req, res) => {
  await callServiceMethod(req, res, convertSupportTicketToTasks(req), "convertSupportTicketAllTask");
};

export const generateTaskSampleSheetProvider = async (req, res) => {
  await callServiceMethod(req, res, generateTaskSampleSheet(req), "generateTaskSampleSheetProvider");
};

export const CreateSupportTicket = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, createCustomerSupportTicket(req), "createcreateCustomerSupportTicketAllTask");
};

export const getSupportTicket = async (req, res) => {
  await callServiceMethod(req, res, AllSupportTicketGet(req), "AllSupportTicketGet");
};
export const getSupportTicketCategory = async (req, res) => {
  await callServiceMethod(req, res, AllSupportTicketCategory(req), "AllSupportTicketCategory");
};

export const getSupportTicketMessage = async (req, res) => {
  await callServiceMethod(req, res, supportTicketMessageGet(req), "supportTicketMessageGet");
};

export const createSupportTicketMessage = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, supportTicketMessageCreate(req), "supportTicketMessageGet");
};

export const readUnreadTask = async (req, res) => {
  await callServiceMethod(req, res, assignReadUnreadTask(req), "assignReadUnreadTask");
};
export const stickyNotesGet = async (req, res) => {
  await callServiceMethod(req, res, getStickeyNotesData(req), "stickyNotesGet");
};
export const stickyNotesCreateData = async (req, res) => {
  await callServiceMethod(req, res, createStickeyNote(req), "stickyNotesCreateData");
};
export const stickyNotesUpdateData = async (req, res) => {
  await callServiceMethod(req, res, editStickeyNote(req), "stickyNotesUpdateData");
};
export const stickyNotesDeleteData = async (req, res) => {
  await callServiceMethod(req, res, deleteStickeyNote(req), "stickyNotesDeleteData");
};
export const stickyNotesComplateData = async (req, res) => {
  await callServiceMethod(req, res, completeStickeyNote(req), "stickyNotesComplateData");
};
export const getTaskCategory = async (req, res) => {
  await callServiceMethod(req, res, taskCategoryGet(req), "getTaskCategory");
};
export const WidgetAddRemove = async (req, res) => {
  await callServiceMethod(req, res, widgetAdd(req), "WidgetAddRemove");
};