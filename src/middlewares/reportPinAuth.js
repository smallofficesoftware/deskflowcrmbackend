// Shared owner+PIN gate for build/author routes across two features: the
// Report Builder (report_definitions CRUD) and the pdfme Document Designer
// (document_print_templates CRUD, src/routes/company_setup/documentPrintTemplateRouter.js).
// One PIN, one verified-flag store — verifying from either feature's UI
// unlocks both, since it's the same login and the same REPORT_PIN value.
//
// No new table for the verified flag: an in-process Map is enough (matches
// the plan's "no per-company DB storage, no new encryption" for the PIN
// itself, extended to the verified-flag too). Lost on server restart —
// that's fine, it just forces re-verification, same spirit as "re-verify
// on next login, not on every page visit."
import companyVsApplicationLoginModel from "../models/company_setup/companyVsApplicationLoginModel.js";
import { REPORT_PIN } from "../utils/appConstants.js";
import { resError } from "../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../services/commonServices.js";

const verifiedLogins = new Map(); // a_application_login_id -> verifiedAtMs
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function isVerified(loginId) {
  const verifiedAt = verifiedLogins.get(String(loginId));
  if (!verifiedAt) return false;
  if (Date.now() - verifiedAt > TTL_MS) {
    verifiedLogins.delete(String(loginId));
    return false;
  }
  return true;
}

// company_flag: 1 => self (the login that actually owns/created the
// company), 2 => join (an invited member) — same field, same "1 = owner"
// meaning already used in whatsappService.js/visitTypeMasterServices.js.
async function isCompanyOwner(a_application_login_id, company_masters_id) {
  const row = await companyVsApplicationLoginModel.findOne({
    where: { a_application_login_id, company_masters_id, company_flag: 1, isDelete: 0 },
    attributes: ["id"],
  });
  return !!row;
}

export const verifyReportPin = async (req) => {
  try {
    const { a_application_login_id, pin } = req.body || {};
    if (!a_application_login_id || !pin) {
      return resError({ ack_msg: "a_application_login_id and pin are required", developer_msg: "Missing a_application_login_id or pin" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }

    const owner = await isCompanyOwner(a_application_login_id, findCompanyId.company_masters_id);
    if (!owner) {
      return resError({ code: 403, ack_msg: "Only the company owner can verify this PIN", developer_msg: "company_flag != 1 for this login" });
    }

    if (!REPORT_PIN || pin != REPORT_PIN) {
      return resError({ code: 403, ack_msg: "Incorrect PIN", developer_msg: "Submitted PIN did not match REPORT_PIN" });
    }

    verifiedLogins.set(String(a_application_login_id), Date.now());
    return { ack: 1, code: 200, ack_msg: "PIN verified", developer_msg: "working good", data: [] };
  } catch (error) {
    console.error("verifyReportPin error:", error);
    return resError({ developer_msg: `Failed to Catch ${error}` });
  }
};

// Route middleware — same envelope convention as the rest of the app
// (res.status(200).send(...) with ack:0/code:403 inside), not a real HTTP
// 403, matching how callServiceMethod/baseController.js already behaves
// for every other error path in this codebase.
export const requireReportPin = async (req, res, next) => {
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return res.status(200).send(resError({ ack_msg: "a_application_login_id is required", developer_msg: "Missing a_application_login_id" }));
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return res.status(200).send(resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" }));
    }

    const owner = await isCompanyOwner(a_application_login_id, findCompanyId.company_masters_id);
    if (!owner) {
      return res.status(200).send(resError({ code: 403, ack_msg: "Only the company owner can access this", developer_msg: "company_flag != 1 for this login" }));
    }

    if (!isVerified(a_application_login_id)) {
      return res.status(200).send(resError({ code: 403, ack_msg: "PIN verification required", developer_msg: "No verified PIN entry for this login" }));
    }

    next();
  } catch (error) {
    console.error("requireReportPin error:", error);
    return res.status(200).send(resError({ developer_msg: `Failed to Catch ${error}` }));
  }
};
