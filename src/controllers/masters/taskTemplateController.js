import { AllTaskDatasource, DeleteTasktemplate, StartAllWorkflow } from "../../services/masters/taskTemplateServices.js";
import callServiceMethod from "../baseController.js";

export const getTaskDatasource = async (req, res) => {
    await callServiceMethod(req, res, AllTaskDatasource(req), "AllTaskDatasource");
};

export const startWorkflow = async (req, res) => {
    await callServiceMethod(req, res, StartAllWorkflow(req), "StartAllWorkflow");
};
export const deleteTaskTemplate = async (req, res) => {
    await callServiceMethod(req, res, DeleteTasktemplate(req), "DeleteTasktemplate");
};