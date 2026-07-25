import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import {AllTaskMessageGet,createAttachment,ReminderCompleteTaskMsg} from "../../services/activities/taskManagementServices.js";
import callServiceMethod from "../baseController.js";


export const allGetTaskHistory = async (req, res) => {
  await callServiceMethod(req, res, AllTaskMessageGet(req), "AllTaskMessageGet");
};

export const addAttachmentTask = async (req, res) => {
  // decryptRequestForMultipart(req);
  await callServiceMethod(req, res, createAttachment(req), "addAttachment");
};

export const completeReminderForTaskMsg = async (req, res) => {
  await callServiceMethod(req, res, ReminderCompleteTaskMsg(req), "ReminderCompleteTaskMsg");
};