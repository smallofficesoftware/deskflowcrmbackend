import crypto from "crypto";
import fs from "fs";
import path from "path";
import companyModel from "../../models/company_setup/companyModel.js";
import { baseURL } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyId } from "./tallyAuthHelper.js";

// The connector installer is hosted at a public URL (the Tally settings screen links to it), so the CRM
// does not serve the first download. What stays here is the connector's SELF-UPDATE: the binary (~80 MB)
// is not in this repo - it lives in media-folder/tally-connector (gitignored), and whoever runs the server
// drops each new tally-connector-<version>.exe there. This file only finds the newest one and streams it.

const connectorDir = () => process.env.TALLY_CONNECTOR_DIR || path.join(process.cwd(), "media-folder", "tally-connector");

/** What the settings screen needs to build the connector's config file. */
export const getConnectorInfo = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const company = await companyModel.findOne({ where: { id: company_masters_id, isDelete: 0 }, attributes: ["qr_code"], raw: true });
    return resSuccess({
      data: {
        item: {
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

// ---------------------------------------------------------------- self-update (connector -> CRM)
// The installed connector asks whether a newer build exists and, if so, downloads it. Only files named
// tally-connector-<major>.<minor>.<patch>.exe take part, so "newest" is the highest version number (not
// whatever was copied last) and a plain tally-connector.exe with no version never triggers an update.

const VERSIONED_EXE = /^tally-connector-(\d+)\.(\d+)\.(\d+)\.exe$/i;

/** The highest-versioned connector exe in the folder, or null. Exported for tests (dir is injectable). */
export const findLatestVersionedConnector = (dir = connectorDir()) => {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let best = null;
  for (const name of names) {
    const m = VERSIONED_EXE.exec(name);
    if (!m || path.basename(name) !== name) continue;
    const parts = [Number(m[1]), Number(m[2]), Number(m[3])];
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;
    const newer = !best || parts[0] > best.parts[0] || (parts[0] === best.parts[0] && (parts[1] > best.parts[1] || (parts[1] === best.parts[1] && parts[2] > best.parts[2])));
    if (newer) best = { name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs, parts, version: parts.join(".") };
  }
  return best;
};

// Hashing ~80 MB on every poll would be wasteful: remember the digest per file (path + size + mtime).
const digestCache = new Map();
const sha256Of = (file) => {
  const key = `${file.fullPath}|${file.size}|${file.mtimeMs}`;
  if (!digestCache.has(key)) {
    digestCache.set(
      key,
      new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        fs.createReadStream(file.fullPath)
          .on("data", (chunk) => hash.update(chunk))
          .on("end", () => resolve(hash.digest("hex")))
          .on("error", reject);
      }).catch((error) => {
        digestCache.delete(key);
        throw error;
      })
    );
  }
  return digestCache.get(key);
};

/** POST /tally/connector/version (connector key) - what the connector compares its own version against. */
export const getConnectorUpdateInfo = async () => {
  try {
    const file = findLatestVersionedConnector();
    if (!file) return resSuccess({ data: { item: null } });
    return resSuccess({ data: { item: { version: file.version, size_bytes: file.size, sha256: await sha256Of(file) } } });
  } catch (error) {
    return resError({ developer_msg: `getConnectorUpdateInfo failed: ${error}` });
  }
};

/** POST /tally/connector/update (connector key) - streams the latest versioned exe. A missing file is answered in the app's usual JSON error shape (HTTP 200). */
export const streamConnectorUpdate = (req, res) => {
  const file = findLatestVersionedConnector();
  if (!file) {
    return res.status(200).send(resError({ code: 404, ack_msg: "No connector update is available.", developer_msg: `No tally-connector-<version>.exe in ${connectorDir()}` }));
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(file.size));
  res.setHeader("X-Connector-Version", file.version);
  const stream = fs.createReadStream(file.fullPath);
  stream.on("error", () => res.destroy());
  return stream.pipe(res);
};
