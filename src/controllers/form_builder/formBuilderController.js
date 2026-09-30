import callServiceMethod from "../baseController.js";
import { listCustomLists, saveCustomList, deleteCustomList } from "../../services/form_builder/formBuilderCustomLists.js";
import { getProductFillValuesEndpoint } from "../../services/form_builder/formBuilderProductLookup.js";
import { searchCustomers } from "../../services/form_builder/formBuilderCustomerLookup.js";
import { stageAction } from "../../services/form_builder/formBuilderApprovalService.js";
import { listSchedules, saveSchedule, deleteSchedule, listMyDueForms, scheduleReport } from "../../services/form_builder/formBuilderScheduleService.js";
import { getImportColumns, runImport } from "../../services/form_builder/formBuilderImportService.js";
import { saveDraft, listDrafts, getDraft, deleteDraft } from "../../services/form_builder/formBuilderDraftService.js";
import { listTemplates, saveTemplateFromForm, deleteTemplate } from "../../services/form_builder/formBuilderTemplates.js";
import {
  listForms,
  previewAutoNumberFormat,
  getForm,
  createForm,
  updateDraftForm,
  publishForm,
  discardDraftForm,
  deleteForm,
  duplicateForm,
  togglePublicLink,
  regenerateShareToken,
  listFormTeamRights,
  saveFormTeamRights,
  listFormPermissions,
  saveFormPermissions,
  getFormPermissionOptions,
  getFormAuditLog,
  getInternalReferenceOptions,
  listPublishedFormsForFilling,
} from "../../services/form_builder/formBuilderService.js";
import {
  listSubmissions,
  getSubmission,
  updateFormSubmission,
  deleteFormSubmission,
  updateSubmissionStatus,
  linkDuplicateContact,
  dismissDuplicateContact,
  getSubmissionAuditLog,
  createInternalSubmissionEntry,
  revealSensitiveField,
} from "../../services/form_builder/formBuilderSubmissionService.js";
import {
  exportSubmissionsBulkPdf,
  exportSubmissionsExcel,
  exportSubmissionPdfController as exportSubmissionPdfService,
  exportBlankFormPdfController as exportBlankFormPdfService,
} from "../../services/form_builder/formSubmissionBulkExportService.js";

export const listFormsController = async (req, res) => {
  await callServiceMethod(req, res, listForms(req), "listForms");
};
export const getFormController = async (req, res) => {
  await callServiceMethod(req, res, getForm(req), "getForm");
};
export const createFormController = async (req, res) => {
  await callServiceMethod(req, res, createForm(req), "createForm");
};
export const updateDraftFormController = async (req, res) => {
  await callServiceMethod(req, res, updateDraftForm(req), "updateDraftForm");
};
export const publishFormController = async (req, res) => {
  await callServiceMethod(req, res, publishForm(req), "publishForm");
};
export const discardDraftFormController = async (req, res) => {
  await callServiceMethod(req, res, discardDraftForm(req), "discardDraftForm");
};
export const deleteFormController = async (req, res) => {
  await callServiceMethod(req, res, deleteForm(req), "deleteForm");
};
export const duplicateFormController = async (req, res) => {
  await callServiceMethod(req, res, duplicateForm(req), "duplicateForm");
};
export const togglePublicLinkController = async (req, res) => {
  await callServiceMethod(req, res, togglePublicLink(req), "togglePublicLink");
};
export const regenerateShareTokenController = async (req, res) => {
  await callServiceMethod(req, res, regenerateShareToken(req), "regenerateShareToken");
};
export const listFormTeamRightsController = async (req, res) => {
  await callServiceMethod(req, res, listFormTeamRights(req), "listFormTeamRights");
};
export const saveFormTeamRightsController = async (req, res) => {
  await callServiceMethod(req, res, saveFormTeamRights(req), "saveFormTeamRights");
};
export const listFormPermissionsController = async (req, res) => {
  await callServiceMethod(req, res, listFormPermissions(req), "listFormPermissions");
};
export const saveFormPermissionsController = async (req, res) => {
  await callServiceMethod(req, res, saveFormPermissions(req), "saveFormPermissions");
};
export const formPermissionOptionsController = async (req, res) => {
  await callServiceMethod(req, res, getFormPermissionOptions(req), "getFormPermissionOptions");
};
export const getFormAuditLogController = async (req, res) => {
  await callServiceMethod(req, res, getFormAuditLog(req), "getFormAuditLog");
};
export const getProductFillValuesController = async (req, res) => {
  await callServiceMethod(req, res, getProductFillValuesEndpoint(req), "getProductFillValues");
};
export const listCustomListsController = async (req, res) => {
  await callServiceMethod(req, res, listCustomLists(req), "listCustomLists");
};
export const saveCustomListController = async (req, res) => {
  await callServiceMethod(req, res, saveCustomList(req), "saveCustomList");
};
export const deleteCustomListController = async (req, res) => {
  await callServiceMethod(req, res, deleteCustomList(req), "deleteCustomList");
};
export const searchCustomersController = async (req, res) => {
  await callServiceMethod(req, res, searchCustomers(req), "searchCustomers");
};
export const previewAutoNumberController = async (req, res) => {
  await callServiceMethod(req, res, previewAutoNumberFormat(req), "previewAutoNumberFormat");
};
export const referenceOptionsController = async (req, res) => {
  await callServiceMethod(req, res, getInternalReferenceOptions(req), "getInternalReferenceOptions");
};
export const listPublishedFormsForFillingController = async (req, res) => {
  await callServiceMethod(req, res, listPublishedFormsForFilling(req), "listPublishedFormsForFilling");
};

// ---------- Submissions ----------

export const createSubmissionController = async (req, res) => {
  await callServiceMethod(req, res, createInternalSubmissionEntry(req), "createInternalSubmissionEntry");
};

export const updateSubmissionController = async (req, res) => {
  await callServiceMethod(req, res, updateFormSubmission(req), "updateFormSubmission");
};
export const listSubmissionsController = async (req, res) => {
  await callServiceMethod(req, res, listSubmissions(req), "listSubmissions");
};
export const getSubmissionController = async (req, res) => {
  await callServiceMethod(req, res, getSubmission(req), "getSubmission");
};
export const deleteSubmissionController = async (req, res) => {
  await callServiceMethod(req, res, deleteFormSubmission(req), "deleteFormSubmission");
};
export const updateSubmissionStatusController = async (req, res) => {
  await callServiceMethod(req, res, updateSubmissionStatus(req), "updateSubmissionStatus");
};
export const linkDuplicateContactController = async (req, res) => {
  await callServiceMethod(req, res, linkDuplicateContact(req), "linkDuplicateContact");
};
export const dismissDuplicateContactController = async (req, res) => {
  await callServiceMethod(req, res, dismissDuplicateContact(req), "dismissDuplicateContact");
};
export const getSubmissionAuditLogController = async (req, res) => {
  await callServiceMethod(req, res, getSubmissionAuditLog(req), "getSubmissionAuditLog");
};
export const revealSensitiveFieldController = async (req, res) => {
  await callServiceMethod(req, res, revealSensitiveField(req), "revealSensitiveField");
};
export const listTemplatesController = async (req, res) => {
  await callServiceMethod(req, res, listTemplates(req), "listTemplates");
};
export const saveTemplateFromFormController = async (req, res) => {
  await callServiceMethod(req, res, saveTemplateFromForm(req), "saveTemplateFromForm");
};
export const deleteTemplateController = async (req, res) => {
  await callServiceMethod(req, res, deleteTemplate(req), "deleteTemplate");
};
export const stageActionController = async (req, res) => {
  await callServiceMethod(req, res, stageAction(req), "stageAction");
};
export const exportBlankFormPdfEndpointController = async (req, res) => {
  await callServiceMethod(req, res, exportBlankFormPdfService(req), "exportBlankFormPdf");
};
export const exportSubmissionPdfEndpointController = async (req, res) => {
  await callServiceMethod(req, res, exportSubmissionPdfService(req), "exportSubmissionPdf");
};
export const exportSubmissionsBulkPdfController = async (req, res) => {
  await callServiceMethod(req, res, exportSubmissionsBulkPdf(req), "exportSubmissionsBulkPdf");
};
export const exportSubmissionsExcelController = async (req, res) => {
  await callServiceMethod(req, res, exportSubmissionsExcel(req), "exportSubmissionsExcel");
};

// ---------- Recurring forms (plan Q1/Q2) and Excel import (Q3/Q4) ----------

export const listSchedulesController = async (req, res) => {
  await callServiceMethod(req, res, listSchedules(req), "listSchedules");
};
export const saveScheduleController = async (req, res) => {
  await callServiceMethod(req, res, saveSchedule(req), "saveSchedule");
};
export const deleteScheduleController = async (req, res) => {
  await callServiceMethod(req, res, deleteSchedule(req), "deleteSchedule");
};
export const listMyDueFormsController = async (req, res) => {
  await callServiceMethod(req, res, listMyDueForms(req), "listMyDueForms");
};
export const scheduleReportController = async (req, res) => {
  await callServiceMethod(req, res, scheduleReport(req), "scheduleReport");
};
export const getImportColumnsController = async (req, res) => {
  await callServiceMethod(req, res, getImportColumns(req), "getImportColumns");
};
export const runImportController = async (req, res) => {
  await callServiceMethod(req, res, runImport(req), "runImport");
};

// ---------- Save and continue later (plan M7) ----------

export const saveDraftController = async (req, res) => {
  await callServiceMethod(req, res, saveDraft(req), "saveDraft");
};
export const listDraftsController = async (req, res) => {
  await callServiceMethod(req, res, listDrafts(req), "listDrafts");
};
export const getDraftController = async (req, res) => {
  await callServiceMethod(req, res, getDraft(req), "getDraft");
};
export const deleteDraftController = async (req, res) => {
  await callServiceMethod(req, res, deleteDraft(req), "deleteDraft");
};
