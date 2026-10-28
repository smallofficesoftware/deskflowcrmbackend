import crypto from "crypto";
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

/** POST /tally/connector/update (connector key) - streams the latest versioned exe. Same error shape as streamConnector. */
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
