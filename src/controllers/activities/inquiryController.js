import {  getAllInquiry ,CreateInquiryBtoB} from "../../services/activities/inquiryServices.js";
import  callServiceMethod  from "../baseController.js";



export const allInquiry = async (req, res) => {
    await callServiceMethod(req, res, getAllInquiry(req), "allInquiry");
  };
export const createInquiry = async (req, res) => {
    await callServiceMethod(req, res, CreateInquiryBtoB(req), "allInquiry");
  };