import callServiceMethod from "../baseController.js";
import {
  getPublicFormSchema,
  submitPublicForm,
  getPublicReferenceOptions,
  getPublicProductFillValues,
  sendPublicFormOtp,
} from "../../services/form_builder/formBuilderPublicService.js";

export const getPublicFormSchemaController = async (req, res) => {
  await callServiceMethod(req, res, getPublicFormSchema(req), "getPublicFormSchema");
};
export const submitPublicFormController = async (req, res) => {
  await callServiceMethod(req, res, submitPublicForm(req), "submitPublicForm");
};
export const getPublicReferenceOptionsController = async (req, res) => {
  await callServiceMethod(req, res, getPublicReferenceOptions(req), "getPublicReferenceOptions");
};
export const getPublicProductFillValuesController = async (req, res) => {
  await callServiceMethod(req, res, getPublicProductFillValues(req), "getPublicProductFillValues");
};
export const sendPublicFormOtpController = async (req, res) => {
  await callServiceMethod(req, res, sendPublicFormOtp(req), "sendPublicFormOtp");
};
