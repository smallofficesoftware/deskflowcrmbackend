import fs from "fs-extra";
import path from "path";
import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { applyLockDecisions, countAffectedAccounts, newlyDisabledMethods } from "./storefrontModeSwitch.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "ecommerce-storefront";

// First functional slice of the ecommerce storefront addon's CRM admin
// settings page (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P1/4.4).
// Reads/writes the GENERIC marketplace_addon_settings table filtered by
// addon_code='ecommerce-storefront' - same shape as tallySettingsService.js,
// this file does not own that table either, it just uses it like any addon
// would (REVISED 21-10-2026, per the user: no dedicated storefront_payment_
// settings/storefront_auth_settings tables - see plan 4.2a/4.2c/section 8).

export const getStorefrontSettings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const model = marketplaceAddonSettingsModel(req.tenantDB);
    const row = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
      raw: true,
    });

    // With raw:true, mysql2 hands back config_json as a plain string, not an
    // auto-parsed object (same latent bug found and fixed in
    // storefrontAuthSettings.js - this read path never exercised the JSON
    // column with real content until the auth-toggle UI needed it).
    if (row && typeof row.config_json === "string") {
      try {
        row.config_json = JSON.parse(row.config_json);
      } catch {
        row.config_json = {};
      }
    }

    return resSuccess({ data: { item: row || null } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontSettings failed: ${error}` });
  }
};

/** Mode-switch edge case (Q3(d)): before actually saving a config_json that
 * newly disables email_light_mode_enabled/auth_invite_only/auth_mobile_
 * otp_enabled/auth_email_otp_enabled (the four "lockable" methods - see
 * storefrontModeSwitch.js for why the two PIN methods are excluded), check
 * whether any existing accounts signed up through that method. If so, and
 * the caller hasn't already answered (lock_decisions), save is REFUSED and
 * the affected counts are returned instead - the CRM settings UI shows a
 * "keep or lock" prompt per affected method, then resubmits with
 * lock_decisions filled in. Toggling anything else (including PIN methods,
 * or disabling-then-reenabling in the same save) skips this entirely. */
export const saveStorefrontSettings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { connection_mode, direct_url_host, direct_url_port, config_json, lock_decisions } = req.body || {};
    const model = marketplaceAddonSettingsModel(req.tenantDB);

    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
    });

    // config_json comes back as a JSON STRING even on a non-raw instance read
    // (confirmed live - not just the raw:true case fixed elsewhere) - parse
    // defensively or every key compares as undefined and nothing ever looks
    // "newly disabled".
    let oldConfig = existing?.config_json;
    if (typeof oldConfig === "string") {
      try {
        oldConfig = JSON.parse(oldConfig);
      } catch {
        oldConfig = {};
      }
    }

    const disabledNow = newlyDisabledMethods(oldConfig || {}, config_json || {});
    if (disabledNow.length > 0 && !lock_decisions) {
      const affected = await countAffectedAccounts(req.tenantDB, company_masters_id, disabledNow);
      if (affected.length > 0) {
        return resSuccess({ ack_msg: "Confirm how to handle existing accounts before saving.", data: { needs_decision: true, affected } });
      }
    }

    if (lock_decisions) {
      await applyLockDecisions(req.tenantDB, company_masters_id, lock_decisions);
    }

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      connection_mode,
      direct_url_host,
      direct_url_port,
      config_json,
      modified_date: new Date(),
    };

    const row = existing ? await existing.update(fields) : await model.create(fields);

    return resSuccess({ data: { item: row } });
  } catch (error) {
    return resError({ developer_msg: `saveStorefrontSettings failed: ${error}` });
  }
};

// ---------------------------------------------------------------- favicon (tab icon + web-app icon)
// The file is stored beside the company's other images (media-folder/company_image/<company id>/, served at
// /companyImg/) and only its relative path lives in config_json.favicon_path, like theme_accent_color.

const FAVICON_NAME = /^\d+\/storefront-favicon-\d+\.(png|ico|jpg|webp)$/;

/** Real type from the file's first bytes - never from the client-supplied name or mime type. */
const faviconTypeFromBytes = (buf) => {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) return "ico";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
};

const readConfig = (row) => {
  let config = row?.config_json;
  if (typeof config === "string") {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }
  return config && typeof config === "object" ? config : {};
};

const companyImageDir = () => path.join(process.cwd(), "media-folder", "company_image");

const removeFaviconFile = async (relativePath) => {
  if (typeof relativePath !== "string" || !FAVICON_NAME.test(relativePath)) return; // never delete anything we did not write
  await fs.remove(path.join(companyImageDir(), relativePath)).catch(() => {});
};

const saveFaviconPath = async (req, company_masters_id, favicon_path) => {
  const model = marketplaceAddonSettingsModel(req.tenantDB);
  const existing = await model.findOne({ where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 } });
  const previousConfig = readConfig(existing); // read BEFORE the update: the instance reflects the new value afterwards
  const config = { ...previousConfig, favicon_path };
  if (existing) await existing.update({ config_json: config, modified_date: new Date() });
  else await model.create({ company_masters_id, addon_code: ADDON_CODE, config_json: config, modified_date: new Date() });
  return previousConfig.favicon_path;
};

/** POST /storefront/favicon/upload - multipart, field "favicon". */
export const uploadStorefrontFavicon = async (req) => {
  const tempPath = req.file?.path;
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    if (!tempPath) return resBadRequest({ ack_msg: "Choose an image to upload." });

    const head = Buffer.alloc(16);
    const handle = await fs.open(tempPath, "r");
    try {
      await fs.read(handle, head, 0, 16, 0);
    } finally {
      await fs.close(handle);
    }
    const type = faviconTypeFromBytes(head);
    if (!type) return resBadRequest({ ack_msg: "That file is not a valid PNG, ICO, JPG or WEBP image." });

    const dir = path.join(companyImageDir(), String(company_masters_id));
    await fs.mkdirp(dir);
    const fileName = `storefront-favicon-${Date.now()}.${type}`;
    await fs.move(tempPath, path.join(dir, fileName));

    const favicon_path = `${company_masters_id}/${fileName}`;
    const previous = await saveFaviconPath(req, company_masters_id, favicon_path);
    if (previous !== favicon_path) await removeFaviconFile(previous);

    return resSuccess({ data: { item: { favicon_path } } });
  } catch (error) {
    return resError({ developer_msg: `uploadStorefrontFavicon failed: ${error}` });
  } finally {
    if (tempPath) await fs.remove(tempPath).catch(() => {}); // already moved on success
  }
};

/** POST /storefront/favicon/remove */
export const removeStorefrontFavicon = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const previous = await saveFaviconPath(req, company_masters_id, "");
    await removeFaviconFile(previous);
    return resSuccess({ data: { item: { favicon_path: "" } } });
  } catch (error) {
    return resError({ developer_msg: `removeStorefrontFavicon failed: ${error}` });
  }
};

export { FAVICON_NAME, companyImageDir, faviconTypeFromBytes, readConfig };
