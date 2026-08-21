import {
  listReviews,
  submitReview,
  submitStorePromptResponse,
} from "../../services/company_setup/reviewServices.js";
import callServiceMethod from "../baseController.js";

export const submitReviewController = async (req, res) => {
  await callServiceMethod(req, res, submitReview(req), "submitReview");
};

export const submitStorePromptResponseController = async (req, res) => {
  await callServiceMethod(req, res, submitStorePromptResponse(req), "submitStorePromptResponse");
};

export const listReviewsController = async (req, res) => {
  await callServiceMethod(req, res, listReviews(req), "listReviews");
};
