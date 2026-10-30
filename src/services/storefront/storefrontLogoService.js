import path from "path";
import fs from "fs-extra";
import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { companyImageDir, faviconTypeFromBytes, readConfig } from "./storefrontSettingsService.js";
import { triggerStorefrontRepublish } from "./storefrontRepublishService.js";

// The store's own logo (Ecommerce settings > Storefront logo), separate from the company logo the CRM uses on
// documents. It is usually a wide logo, shown in the storefront header and footer; without one the storefront falls
// back to the company logo. Stored like the favicon: the file under media-folder/company_image/<company id>/ (served
// at /companyImg/) and only its relative path in config_json.logo_path.

const ADDON_CODE = "ecommerce-storefront";
export const LOGO_NAME = /^\d+\/storefront-logo-\d+\.(png|jpg|webp)$/;

const removeLogoFile = async (relativePath) => {
  if (typeof relativePath !== "string" || !LOGO_NAME.test(relativePath)) return; // never delete anything we did not write
  await fs.remove(path.join(companyImageDir(), relativePath)).catch(() => {});
};

const saveLogoPath = async (req, company_masters_id, logo_path) => {
  const model = marketplaceAddonSettingsModel(req.tenantDB);
  const existing = await model.findOne({ where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 } });
  const previousConfig = readConfig(existing); // read BEFORE the update: the instance reflects the new value afterwards
  const config = { ...previousConfig, logo_path };
  if (existing) await existing.update({ config_json: config, modified_date: new Date() });
  else await model.create({ company_masters_id, addon_code: ADDON_CODE, config_json: config, modified_date: new Date() });
  return previousConfig.logo_path;
};

/** POST /storefront/logo/upload - multipart, field "logo". PNG, JPG or WEBP only (no SVG: it can carry scripts). */
export const uploadStorefrontLogo = async (req) => {
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
    const type = faviconTypeFromBytes(head); // real type from the file's first bytes, never from its name
    if (!type || type === "ico") return resBadRequest({ ack_msg: "That file is not a valid PNG, JPG or WEBP image." });

    const dir = path.join(companyImageDir(), String(company_masters_id));
    await fs.mkdirp(dir);
    const fileName = `storefront-logo-${Date.now()}.${type}`;
    await fs.move(tempPath, path.join(dir, fileName));

    const logo_path = `${company_masters_id}/${fileName}`;
    const previous = await saveLogoPath(req, company_masters_id, logo_path);
    if (previous !== logo_path) await removeLogoFile(previous);

    triggerStorefrontRepublish(company_masters_id);
    return resSuccess({ data: { item: { logo_path } } });
  } catch (error) {
    return resError({ developer_msg: `uploadStorefrontLogo failed: ${error}` });
  } finally {
    if (tempPath) await fs.remove(tempPath).catch(() => {}); // already moved on success
  }
};

/** POST /storefront/logo/remove */
export const removeStorefrontLogo = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const previous = await saveLogoPath(req, company_masters_id, "");
    await removeLogoFile(previous);
    triggerStorefrontRepublish(company_masters_id);
    return resSuccess({ data: { item: { logo_path: "" } } });
  } catch (error) {
    return resError({ developer_msg: `removeStorefrontLogo failed: ${error}` });
  }
};
