import {
  copyFromSystemDashboardDefinition,
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  getDashboard,
  listDashboards,
  listSystemDashboardDefinitions,
  reorderDashboards,
  runDashboard,
  setDefaultDashboard,
  updateDashboard,
} from "../../services/report_builder/dashboardServices.js";
import {
  addQuickCounterWidget,
  addWidget,
  deleteWidget,
  updateWidget,
  updateWidgetPositions,
} from "../../services/report_builder/dashboardWidgetServices.js";
import callServiceMethod from "../baseController.js";

export const createDashboardController = async (req, res) => {
  await callServiceMethod(req, res, createDashboard(req), "createDashboard");
};

export const updateDashboardController = async (req, res) => {
  await callServiceMethod(req, res, updateDashboard(req), "updateDashboard");
};

export const deleteDashboardController = async (req, res) => {
  await callServiceMethod(req, res, deleteDashboard(req), "deleteDashboard");
};

export const listDashboardsController = async (req, res) => {
  await callServiceMethod(req, res, listDashboards(req), "listDashboards");
};

export const getDashboardController = async (req, res) => {
  await callServiceMethod(req, res, getDashboard(req), "getDashboard");
};

export const reorderDashboardsController = async (req, res) => {
  await callServiceMethod(req, res, reorderDashboards(req), "reorderDashboards");
};

export const setDefaultDashboardController = async (req, res) => {
  await callServiceMethod(req, res, setDefaultDashboard(req), "setDefaultDashboard");
};

export const duplicateDashboardController = async (req, res) => {
  await callServiceMethod(req, res, duplicateDashboard(req), "duplicateDashboard");
};

export const runDashboardController = async (req, res) => {
  await callServiceMethod(req, res, runDashboard(req, res), "runDashboard");
};

export const listSystemDashboardDefinitionsController = async (req, res) => {
  await callServiceMethod(req, res, listSystemDashboardDefinitions(req), "listSystemDashboardDefinitions");
};

export const copyFromSystemDashboardDefinitionController = async (req, res) => {
  await callServiceMethod(req, res, copyFromSystemDashboardDefinition(req), "copyFromSystemDashboardDefinition");
};

export const addWidgetController = async (req, res) => {
  await callServiceMethod(req, res, addWidget(req), "addWidget");
};

export const addQuickCounterWidgetController = async (req, res) => {
  await callServiceMethod(req, res, addQuickCounterWidget(req), "addQuickCounterWidget");
};

export const updateWidgetController = async (req, res) => {
  await callServiceMethod(req, res, updateWidget(req), "updateWidget");
};

export const deleteWidgetController = async (req, res) => {
  await callServiceMethod(req, res, deleteWidget(req), "deleteWidget");
};

export const updateWidgetPositionsController = async (req, res) => {
  await callServiceMethod(req, res, updateWidgetPositions(req), "updateWidgetPositions");
};
