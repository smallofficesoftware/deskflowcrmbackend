import moment from "moment";
import loginModel from "../../models/application_login/loginModel.js";
import reviewModel from "../../models/company_setup/reviewModel.js";
import { getCompanyByLoginId } from "../commonServices.js";
import {
  APPLICATION_APK_URL_ANDROID,
  APPLICATION_APK_URL_IOS,
  REVIEW_COMMENT_MIN_LENGTH,
  REVIEW_INITIAL_PROMPT_DAYS,
  REVIEW_MIN_STAR_FOR_STORE_PROMPT,
  REVIEW_PROMPT_ENABLED,
  REVIEW_RETRY_INTERVAL_DAYS,
  REVIEW_STORE_PROMPT_DELAY_DAYS,
} from "../../utils/appConstants.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";

const PLATFORM_VALUES = ["web", "android", "ios"];

const nowTimestamp = () => moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
const daysSince = (date) => moment().diff(moment(date), "days");

// Same precedence as onLoad's clientIp extraction in loginService.js.
const getClientIp = (req) => {
  let ip =
    req.headers?.["cf-connecting-ip"] ||
    req.headers?.["x-real-ip"] ||
    (req.headers?.["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    "";
  if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
  return ip;
};

/*
 * Plain-argument helper (not (req)-shaped) — called from inside the onLoad
 * service (loginService.js) so its result rides along in the existing
 * onLoad/onload response instead of a separate endpoint. app + web both go
 * through onLoad. Web callers must never receive show:"store_review"
 * (there's no store to send a browser to); only the flutter app (platform
 * "android"/"ios"), after a completed >=4-star submit, gets the
 * store-review path. Never throws — a review-status hiccup must never
 * break the rest of onLoad's response.
 */
export const getReviewPromptStatus = async (a_application_login_id, platform) => {
  try {
    if (!a_application_login_id || !PLATFORM_VALUES.includes(platform)) {
      return { show: "none" };
    }

    if (!REVIEW_PROMPT_ENABLED) {
      return { show: "none" };
    }

    const login = await loginModel.findOne({
      where: { id: a_application_login_id },
      attributes: ["id", "created_date_time"],
    });

    if (!login?.created_date_time) {
      return { show: "none" };
    }

    const row = await reviewModel.findOne({
      where: { a_application_login_id, isDelete: 0 },
    });

    const isApp = platform !== "web";
    const storeUrl = platform === "ios" ? APPLICATION_APK_URL_IOS : APPLICATION_APK_URL_ANDROID;

    const eligibleForStorePrompt =
      isApp &&
      row?.is_completed == 1 &&
      Number(row.rating) >= REVIEW_MIN_STAR_FOR_STORE_PROMPT &&
      row.store_review_completed != 1;

    if (eligibleForStorePrompt) {
      const dueFrom = row.store_prompt_last_asked_date || row.rating_given_date;
      const gateDays = row.store_prompt_last_asked_date ? REVIEW_RETRY_INTERVAL_DAYS : REVIEW_STORE_PROMPT_DELAY_DAYS;

      if (dueFrom && daysSince(dueFrom) >= gateDays) {
        return { show: "store_review", storeUrl };
      }
      return { show: "none" };
    }

    // A completed system-review that isn't (or is no longer) eligible for a
    // store prompt (e.g. <4 stars, or web, or store already completed) is done.
    if (row?.is_completed == 1) {
      return { show: "none" };
    }

    if (!row) {
      if (daysSince(login.created_date_time) >= REVIEW_INITIAL_PROMPT_DAYS) {
        return { show: "system_review", prefill: {} };
      }
      return { show: "none" };
    }

    // Row exists but not completed (either never given a star, or given a
    // star and cancelled) — retry on the interval regardless of what's saved.
    if (!row.last_asked_date || daysSince(row.last_asked_date) >= REVIEW_RETRY_INTERVAL_DAYS) {
      return { show: "system_review", prefill: { rating: row.rating, comment: row.comment } };
    }

    return { show: "none" };
  } catch (e) {
    console.error("Error in getReviewPromptStatus:", e);
    return { show: "none" };
  }
};

/*
 * action "submit" = the user pressed the real submit button (comment
 * required when rating < REVIEW_MIN_STAR_FOR_STORE_PROMPT) and marks the
 * system-review complete. action "cancel" saves whatever star was picked
 * (if any) but never completes the review — it stays eligible for the
 * normal retry interval either way.
 */
export const submitReview = async (req) => {
  try {
    const { a_application_login_id, platform, device_id, action, rating, comment } = req.body;

    if (!a_application_login_id) {
      return resError({ ack_msg: "Login id is required" });
    }
    if (!PLATFORM_VALUES.includes(platform)) {
      return resError({ ack_msg: "platform must be 'web', 'android' or 'ios'" });
    }
    if (!["submit", "cancel"].includes(action)) {
      return resError({ ack_msg: "action must be 'submit' or 'cancel'" });
    }

    const numericRating = rating !== undefined && rating !== null && rating !== "" ? Number(rating) : null;
    if (numericRating !== null && (numericRating < 1 || numericRating > 5)) {
      return resError({ ack_msg: "Rating must be between 1 and 5" });
    }

    if (action === "submit") {
      if (numericRating === null) {
        return resError({ ack_msg: "Rating is required to submit" });
      }
      if (numericRating < REVIEW_MIN_STAR_FOR_STORE_PROMPT) {
        if (!comment || comment.trim().length < REVIEW_COMMENT_MIN_LENGTH) {
          return resError({
            ack_msg: `A comment of at least ${REVIEW_COMMENT_MIN_LENGTH} characters is required for a rating below ${REVIEW_MIN_STAR_FOR_STORE_PROMPT} stars`,
          });
        }
      }
    }

    const companyInfo = await getCompanyByLoginId(a_application_login_id);
    if (!companyInfo?.company_masters_id) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: `No company found for a_application_login_id: ${a_application_login_id}`,
      });
    }

    const now = nowTimestamp();
    const payload = {
      platform,
      device_id: device_id || null,
      ip_address: getClientIp(req) || null,
      last_asked_date: now,
      modified_date: now,
    };

    if (numericRating !== null) {
      payload.rating = numericRating;
      payload.comment = comment?.trim() || null;
      payload.review_type = "system";
    }

    if (action === "submit") {
      payload.is_completed = 1;
      payload.rating_given_date = now;
    }

    const existing = await reviewModel.findOne({
      where: { company_masters_id: companyInfo.company_masters_id, a_application_login_id, isDelete: 0 },
      attributes: ["id"],
    });

    if (existing?.id) {
      await reviewModel.update(payload, { where: { id: existing.id } });
      return resSuccess({ ack_msg: "Review saved" });
    }

    await reviewModel.create({
      company_masters_id: companyInfo.company_masters_id,
      a_application_login_id,
      created_date_time: now,
      ...payload,
    });
    return resSuccess({ ack_msg: "Review saved" });
  } catch (e) {
    console.error("Error in submitReview:", e);
    return resError({ developer_msg: `Error: ${e.message}` });
  }
};

/*
 * App-only. "opened" = user followed the store link (final, never ask
 * again). "dismissed" = closed the prompt, retry on the normal interval.
 */
export const submitStorePromptResponse = async (req) => {
  try {
    const { a_application_login_id, action } = req.body;

    if (!a_application_login_id) {
      return resError({ ack_msg: "Login id is required" });
    }
    if (!["opened", "dismissed"].includes(action)) {
      return resError({ ack_msg: "action must be 'opened' or 'dismissed'" });
    }

    const existing = await reviewModel.findOne({
      where: { a_application_login_id, isDelete: 0 },
      attributes: ["id"],
    });
    if (!existing?.id) {
      return resError({ ack_msg: "Review not found" });
    }

    const now = nowTimestamp();
    if (action === "opened") {
      await reviewModel.update(
        { store_review_completed: 1, modified_date: now },
        { where: { id: existing.id } }
      );
    } else {
      await reviewModel.update(
        { store_prompt_last_asked_date: now, modified_date: now },
        { where: { id: existing.id } }
      );
    }

    return resSuccess({ ack_msg: "Updated" });
  } catch (e) {
    console.error("Error in submitStorePromptResponse:", e);
    return resError({ developer_msg: `Error: ${e.message}` });
  }
};

// Company-scoped list — used by the per-company web dashboard's Reviews page.
export const listReviews = async (req) => {
  try {
    const { a_application_login_id, ul = 0, ll = 20 } = req.body;

    if (!a_application_login_id) {
      return resError({ ack_msg: "Login id is required" });
    }

    const companyInfo = await getCompanyByLoginId(a_application_login_id);
    if (!companyInfo?.company_masters_id) {
      return resError({ ack_msg: "Company not found" });
    }

    const rows = await reviewModel.findAll({
      where: { company_masters_id: companyInfo.company_masters_id, isDelete: 0, is_completed: 1 },
      order: [["modified_date", "DESC"]],
      offset: Number(ul) || 0,
      limit: Number(ll) || 20,
    });

    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("Error in listReviews:", e);
    return resError({ developer_msg: `Error: ${e.message}` });
  }
};
