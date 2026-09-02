import {
  copyFromSystemReportDefinition,
  createReportDefinition,
  deleteReportDefinition,
  getMetricsRegistry,
  getModelRegistry,
  getPluginRegistry,
  getReportTeamRights,
  listReportDefinitions,
  listRunnableReportDefinitions,
  listSystemReportDefinitions,
  runBatchReportDefinitions,
  runReportDefinition,
  saveReportTeamRights,
  updateReportDefinition,
} from "../../services/report_builder/reportDefinitionServices.js";
import { exportReportExcel, exportReportPdf } from "../../services/report_builder/reportPdfExport.js";
import callServiceMethod from "../baseController.js";

export const getModelRegistryController = async (req, res) => {
  await callServiceMethod(req, res, getModelRegistry(req), "getModelRegistry");
};

export const getPluginRegistryController = async (req, res) => {
  await callServiceMethod(req, res, getPluginRegistry(req), "getPluginRegistry");
};

export const getMetricsRegistryController = async (req, res) => {
  await callServiceMethod(req, res, getMetricsRegistry(req), "getMetricsRegistry");
};

export const createReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, createReportDefinition(req), "createReportDefinition");
};

export const updateReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, updateReportDefinition(req), "updateReportDefinition");
};

export const deleteReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, deleteReportDefinition(req), "deleteReportDefinition");
};

export const listReportDefinitionsController = async (req, res) => {
  await callServiceMethod(req, res, listReportDefinitions(req), "listReportDefinitions");
};

export const listSystemReportDefinitionsController = async (req, res) => {
  await callServiceMethod(req, res, listSystemReportDefinitions(req), "listSystemReportDefinitions");
};

export const copyFromSystemReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, copyFromSystemReportDefinition(req), "copyFromSystemReportDefinition");
};

export const listRunnableReportDefinitionsController = async (req, res) => {
  await callServiceMethod(req, res, listRunnableReportDefinitions(req), "listRunnableReportDefinitions");
};

export const saveReportTeamRightsController = async (req, res) => {
  await callServiceMethod(req, res, saveReportTeamRights(req), "saveReportTeamRights");
};

export const getReportTeamRightsController = async (req, res) => {
  await callServiceMethod(req, res, getReportTeamRights(req), "getReportTeamRights");
};

export const runReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, runReportDefinition(req, res), "runReportDefinition");
};

export const runBatchReportDefinitionsController = async (req, res) => {
  await callServiceMethod(req, res, runBatchReportDefinitions(req, res), "runBatchReportDefinitions");
};

export const exportReportExcelController = async (req, res) => {
  await callServiceMethod(req, res, exportReportExcel(req, res), "exportReportExcel");
};

export const exportReportPdfController = async (req, res) => {
  await callServiceMethod(req, res, exportReportPdf(req, res), "exportReportPdf");
};
