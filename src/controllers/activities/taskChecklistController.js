import {
  createTaskChecklistItem,
  deleteTaskChecklistItem,
  getTaskChecklistItems,
  reorderTaskChecklistItems,
  updateTaskChecklistItem,
} from "../../services/activities/taskManagementServices.js";
import callServiceMethod from "../baseController.js";

export const getChecklist = async (req, res) => {
  await callServiceMethod(req, res, getTaskChecklistItems(req), "getTaskChecklistItems");
};

export const addChecklistItem = async (req, res) => {
  await callServiceMethod(req, res, createTaskChecklistItem(req), "createTaskChecklistItem");
};

export const editChecklistItem = async (req, res) => {
  await callServiceMethod(req, res, updateTaskChecklistItem(req), "updateTaskChecklistItem");
};

export const removeChecklistItem = async (req, res) => {
  await callServiceMethod(req, res, deleteTaskChecklistItem(req), "deleteTaskChecklistItem");
};

export const reorderChecklist = async (req, res) => {
  await callServiceMethod(req, res, reorderTaskChecklistItems(req), "reorderTaskChecklistItems");
};
