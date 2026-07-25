import {
  getCouponWisePlanDetail,
  getPlanDetail
} from "../../services/application_login/applicationPageServices.js";
import callServiceMethod from "../baseController.js";

export const planDetailGet = async (req, res) => {
  await callServiceMethod(req, res, getPlanDetail(req), "getPlanDetail");
};
export const getCouponWiseDetails = async (req, res) => {
  await callServiceMethod(req, res, getCouponWisePlanDetail(req), "getCouponWisePlanDetail");
};
