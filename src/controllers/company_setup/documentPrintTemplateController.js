import { buildDataDictionary } from "../../services/pdfmeEngine/dataDictionary.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import {
  applyOptionsToDraft,
  copyFromSystemTemplate,
  createDocumentTemplate,
  deleteDocumentTemplate,
  discardDraftChanges,
  duplicateDocumentTemplate,
  exportDocumentTemplate,
  getDocumentTemplate,
  importDocumentTemplate,
  listDocumentTemplates,
  listSystemTemplates,
  listTemplateVersions,
  previewDocumentTemplate,
  publishDocumentTemplate,
  reorderDocumentTemplates,
  restoreTemplateVersion,
  setDefaultDocumentTemplate,
  updateDocumentTemplate,
  verifyDocumentManagerPin,
} from "../../services/company_setup/documentPrintTemplateServices.js";
import callServiceMethod from "../baseController.js";

export const verifyDocumentManagerPinController = async (req, res) => {
  await callServiceMethod(req, res, verifyDocumentManagerPin(req), "verifyDocumentManagerPin");
};

export const listDocumentTemplatesController = async (req, res) => {
  await callServiceMethod(req, res, listDocumentTemplates(req), "listDocumentTemplates");
};

export const getDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, getDocumentTemplate(req), "getDocumentTemplate");
};

export const createDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, createDocumentTemplate(req), "createDocumentTemplate");
};

export const updateDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, updateDocumentTemplate(req), "updateDocumentTemplate");
};

export const applyOptionsToDraftController = async (req, res) => {
  await callServiceMethod(req, res, applyOptionsToDraft(req), "applyOptionsToDraft");
};

export const publishDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, publishDocumentTemplate(req), "publishDocumentTemplate");
};

export const discardDraftChangesController = async (req, res) => {
  await callServiceMethod(req, res, discardDraftChanges(req), "discardDraftChanges");
};

export const reorderDocumentTemplatesController = async (req, res) => {
  await callServiceMethod(req, res, reorderDocumentTemplates(req), "reorderDocumentTemplates");
};

export const setDefaultDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, setDefaultDocumentTemplate(req), "setDefaultDocumentTemplate");
};

export const deleteDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, deleteDocumentTemplate(req), "deleteDocumentTemplate");
};

export const listTemplateVersionsController = async (req, res) => {
  await callServiceMethod(req, res, listTemplateVersions(req), "listTemplateVersions");
};

export const restoreTemplateVersionController = async (req, res) => {
  await callServiceMethod(req, res, restoreTemplateVersion(req), "restoreTemplateVersion");
};

export const duplicateDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, duplicateDocumentTemplate(req), "duplicateDocumentTemplate");
};

export const exportDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, exportDocumentTemplate(req), "exportDocumentTemplate");
};

export const importDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, importDocumentTemplate(req), "importDocumentTemplate");
};

export const listSystemTemplatesController = async (req, res) => {
  await callServiceMethod(req, res, listSystemTemplates(req), "listSystemTemplates");
};

export const copyFromSystemTemplateController = async (req, res) => {
  await callServiceMethod(req, res, copyFromSystemTemplate(req), "copyFromSystemTemplate");
};

export const previewDocumentTemplateController = async (req, res) => {
  await callServiceMethod(req, res, previewDocumentTemplate(req), "previewDocumentTemplate");
};

export const dataDictionaryController = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    (async () => {
      try {
        const { doc_type } = req.body || {};
        if (!doc_type) return resError({ developer_msg: "doc_type is required" });
        const dictionary = await buildDataDictionary(req, doc_type);
        return resSuccess({ data: { item: dictionary } });
      } catch (e) {
        console.log(e);
        return resError({ developer_msg: `Failed to Catch ${e}` });
      }
    })(),
    "dataDictionary"
  );
};
