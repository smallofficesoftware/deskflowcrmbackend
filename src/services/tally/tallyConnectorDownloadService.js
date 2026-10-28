import fs from "fs";
import path from "path";
import companyModel from "../../models/company_setup/companyModel.js";
import { baseURL } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyId } from "./tallyAuthHelper.js";

// Hands the Deskflow Tally Connector installer to a company's admin from the Tally settings screen.
// The binary (~80 MB) is deliberately NOT in this repo: it lives in media-folder/ (gitignored, the
// same place every other served upload lives), and whoever runs the server drops each new build
// there. This file only finds the newest one and streams it - nothing is built or generated here.

const connectorDir = () => process.env.TALLY_CONNECTOR_DIR || path.join(process.cwd(), "media-folder", "tally-connector");

// Only files that look like the connector, directly inside that folder - never an arbitrary path.
const CONNECTOR_FILE = /^tally-connector.*\.(exe|zip|msi)$/i;

/** The newest connector build in the folder, or null when none has been added yet. */
export const findConnectorFile = () => {
  const dir = connectorDir();
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const files = names
    .filter((n) => CONNECTOR_FILE.test(n) && path.basename(n) === n)
    .map((n) => {
      const fullPath = path.join(dir, n);
      const stat = fs.statSync(fullPath);
      return stat.isFile() ? { name: n, fullPath, size: stat.size, updated_at: stat.mtime } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
  return files[0] || null;
};

/** What the settings screen needs to offer the download and to build the connector's config file. */
export const getConnectorInfo = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const company = await companyModel.findOne({ where: { id: company_masters_id, isDelete: 0 }, attributes: ["qr_code"], raw: true });
    const file = findConnectorFile();
    return resSuccess({
      data: {
        item: {
          available: Boolean(file),
          file_name: file?.name || null,
          size_bytes: file?.size || null,
          updated_at: file?.updated_at || null,
          // The connector identifies the company by its public code and calls <crm_base_url>/api/...
          company_code: company?.qr_code || null,
          crm_base_url: baseURL,
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `getConnectorInfo failed: ${error}` });
  }
};

/** Streams the connector. Not a JSON endpoint, so it writes to `res` itself; a missing file is
 *  answered in the app's usual JSON error shape (HTTP 200, like requireAddon) for the screen to show. */
export const streamConnector = (req, res) => {
  const file = findConnectorFile();
  if (!file) {
    return res.status(200).send(
      resError({
        code: 404,
        ack_msg: "The connector installer has not been added to this server yet. Ask your administrator to copy it into media-folder/tally-connector.",
        developer_msg: `No tally-connector*.exe|zip|msi in ${connectorDir()}`,
      })
    );
  }
  return res.download(file.fullPath, file.name, (error) => {
    if (error && !res.headersSent) {
      res.status(200).send(resError({ developer_msg: `Connector download failed: ${error.message}` }));
    }
  });
};
