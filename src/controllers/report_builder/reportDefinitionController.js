import {
  copyFromSystemReportDefinition,
  createReportDefinition,
  createReportGroup,
  deleteReportDefinition,
  deleteReportGroup,
  duplicateReportDefinition,
  exportReportDefinition,
  importReportDefinition,
  previewReportDefinition,
  getGeneralFilterConfig,
  getMetricsRegistry,
  getModelRegistry,
  getPluginRegistry,
  getReportTeamRights,
  listReportDefinitions,
  listReportGroups,
  listReportRuns,
  listRunnableReportDefinitions,
  listSystemReportDefinitions,
  runBatchReportDefinitions,
  runReportDefinition,
  saveReportTeamRights,
  testRunReportDefinition,
  updateReportDefinition,
  updateReportGroup,
} from "../../services/report_builder/reportDefinitionServices.js";
import { exportReportExcel, exportReportPdf, previewReportPdf } from "../../services/report_builder/reportPdfExport.js";
import {
  createReportSchedule,
  deleteReportSchedule,
  listReportSchedules,
  reportScheduleDispatchCroneTabRunner,
  updateReportSchedule,
} from "../../services/report_builder/reportScheduleServices.js";
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

export const duplicateReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, duplicateReportDefinition(req), "duplicateReportDefinition");
};

export const previewReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, previewReportDefinition(req), "previewReportDefinition");
};

export const exportReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, exportReportDefinition(req), "exportReportDefinition");
};

export const importReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, importReportDefinition(req), "importReportDefinition");
};

export const listRunnableReportDefinitionsController = async (req, res) => {
  await callServiceMethod(req, res, listRunnableReportDefinitions(req), "listRunnableReportDefinitions");
};

export const getGeneralFilterConfigController = async (req, res) => {
  await callServiceMethod(req, res, getGeneralFilterConfig(req), "getGeneralFilterConfig");
};

export const listReportRunsController = async (req, res) => {
  await callServiceMethod(req, res, listReportRuns(req), "listReportRuns");
};

export const testRunReportDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, testRunReportDefinition(req), "testRunReportDefinition");
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

export const previewReportPdfController = async (req, res) => {
  await callServiceMethod(req, res, previewReportPdf(req, res), "previewReportPdf");
};

export const listReportGroupsController = async (req, res) => {
  await callServiceMethod(req, res, listReportGroups(req), "listReportGroups");
};

export const createReportGroupController = async (req, res) => {
  await callServiceMethod(req, res, createReportGroup(req), "createReportGroup");
};

export const updateReportGroupController = async (req, res) => {
  await callServiceMethod(req, res, updateReportGroup(req), "updateReportGroup");
};

export const deleteReportGroupController = async (req, res) => {
  await callServiceMethod(req, res, deleteReportGroup(req), "deleteReportGroup");
};

export const listReportSchedulesController = async (req, res) => {
  await callServiceMethod(req, res, listReportSchedules(req), "listReportSchedules");
};

export const createReportScheduleController = async (req, res) => {
  await callServiceMethod(req, res, createReportSchedule(req), "createReportSchedule");
};

export const updateReportScheduleController = async (req, res) => {
  await callServiceMethod(req, res, updateReportSchedule(req), "updateReportSchedule");
};

export const deleteReportScheduleController = async (req, res) => {
  await callServiceMethod(req, res, deleteReportSchedule(req), "deleteReportSchedule");
};

export const reportScheduleDispatchCroneTabController = async (req, res) => {
  await callServiceMethod(req, res, reportScheduleDispatchCroneTabRunner(req, res), "reportScheduleDispatchCroneTabRunner");
};
