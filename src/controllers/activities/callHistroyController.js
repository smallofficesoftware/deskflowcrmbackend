import {
  createCall,
  getcall,
  getcallHistoryForContactWise
} from "../../services/activities/callhistoryServices.js";
import callServiceMethod from "../baseController.js";

export const callHistory = async (req, res) => {
  await callServiceMethod(req, res, createCall(req), "createCall");
};
export const getcallHistory = async (req, res) => {
  await callServiceMethod(req, res, getcall(req), "getCall");
};
export const getcontactWiseCallHistory = async (req, res) => {
  await callServiceMethod(req, res, getcallHistoryForContactWise(req), "getCall");
};

