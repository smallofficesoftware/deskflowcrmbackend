import callServiceMethod from "../baseController.js";
import {
  listForms,
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
} from "../../services/form_builder/formBuilderSubmissionService.js";
import {
  exportSubmissionsBulkPdf,
  exportSubmissionsExcel,
  exportSubmissionPdfController as exportSubmissionPdfService,
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
export const getFormAuditLogController = async (req, res) => {
  await callServiceMethod(req, res, getFormAuditLog(req), "getFormAuditLog");
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
export const exportSubmissionPdfEndpointController = async (req, res) => {
  await callServiceMethod(req, res, exportSubmissionPdfService(req), "exportSubmissionPdf");
};
export const exportSubmissionsBulkPdfController = async (req, res) => {
  await callServiceMethod(req, res, exportSubmissionsBulkPdf(req), "exportSubmissionsBulkPdf");
};
export const exportSubmissionsExcelController = async (req, res) => {
  await callServiceMethod(req, res, exportSubmissionsExcel(req), "exportSubmissionsExcel");
};
