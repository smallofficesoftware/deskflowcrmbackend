
import { addCustomFieldDatavalues, addCustomFieldFrom, getAllCustomFieldDatavalueforQrByinquiryy, getAllCustomFieldFrom, getAllCustomFieldFromByUsingCompany, getCustomFieldDatavalues } from "../../services/other_settings/customFieldFormService.js";
import callServiceMethod from "../baseController.js";

export const createCustomFieldFrom = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    addCustomFieldFrom(req),
    "addCustomFieldFrom"
  );
};



export const allCustomFieldFrom = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllCustomFieldFrom(req),
    "getAllCustomFieldFrom"
  );
};


export const createCustomFieldDatavalues = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    addCustomFieldDatavalues(req),
    "addCustomFieldDatavalues"
  );
};



export const getAllCustomFieldDatavalues = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getCustomFieldDatavalues(req),
    "getCustomFieldDatavalues"
  );
};

export const allCustomFieldFrombyQr = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllCustomFieldFromByUsingCompany(req),
    "getAllCustomFieldFromByUsingCompany"
  );
};
export const allgetCustomFieldDatavalueforQrByinquiry = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllCustomFieldDatavalueforQrByinquiryy(req),
    "getAllCustomFieldDatavalueforQrByinquiryy"
  );
};