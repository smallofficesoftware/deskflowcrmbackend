import crypto from "node:crypto";
import dns from "node:dns/promises";
import storefrontDomainModel from "../../models/storefront/storefrontDomainModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VERIFY_PREFIX = "_deskflow-verify";

const present = (row) =>
  row
    ? {
        domain: row.domain,
        verified: Boolean(row.verified_at),
        verification_host: `${VERIFY_PREFIX}.${row.domain}`,
        verification_token: row.verification_token,
      }
    : null;

/** Admin: this company's custom domain + verification state (null if none). */
export const getStorefrontDomain = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!company_masters_id) return resBadRequest({ developer_msg: "Company context missing" });
    const row = await storefrontDomainModel.findOne({ where: { company_masters_id, isDelete: 0 }, raw: true });
    const company = await companyModel.findOne({ where: { id: company_masters_id, isDelete: 0 }, attributes: ["qr_code"], raw: true });

    // STOREFRONT_PUBLIC_BASE: host (+port) the storefront app is served from, e.g. "localhost:3002"
    // in dev or "shop.deskflowcrm.com" in production. Subdomain URL is <slug>.<base>.
    const base = process.env.STOREFRONT_PUBLIC_BASE || "localhost:3002";
    const proto = /^(localhost|127\.)/.test(base) ? "http" : "https";
    const subdomain_url = company?.qr_code ? `${proto}://${company.qr_code}.${base}` : null;
    const custom_domain_url = row?.verified_at ? `https://${row.domain}` : null;
    return resSuccess({ data: { item: present(row), subdomain_url, custom_domain_url } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontDomain failed: ${error}` });
  }
};

/** Admin: set (or replace) the company's custom domain. Always starts unverified. */
export const saveStorefrontDomain = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    const a_application_login_id = req.user?.a_application_login_id ?? req.user?.id;
    if (!company_masters_id) return resBadRequest({ developer_msg: "Company context missing" });

    const domain = String(req.body?.domain || "").trim().toLowerCase();
    if (!domain) {
      await storefrontDomainModel.update({ isDelete: 1 }, { where: { company_masters_id, isDelete: 0 } });
      return resSuccess({ data: { item: null } });
    }
    if (!HOSTNAME_RE.test(domain)) return resBadRequest({ ack_msg: "Enter a valid domain such as shop.example.com" });

    const taken = await storefrontDomainModel.findOne({ where: { domain, isDelete: 0 }, raw: true });
    if (taken && taken.company_masters_id !== company_masters_id) {
      return resBadRequest({ ack_msg: "This domain is already used by another store" });
    }

    const existing = await storefrontDomainModel.findOne({ where: { company_masters_id, isDelete: 0 } });
    if (existing && existing.domain === domain) {
      return resSuccess({ data: { item: present(existing.get({ plain: true })) } });
    }

    const token = crypto.randomBytes(16).toString("hex");
    if (existing) {
      await existing.update({ domain, verification_token: token, verified_at: null });
    } else {
      await storefrontDomainModel.create({ company_masters_id, a_application_login_id, domain, verification_token: token, isDelete: 0 });
    }
    const row = await storefrontDomainModel.findOne({ where: { company_masters_id, isDelete: 0 }, raw: true });
    return resSuccess({ data: { item: present(row) } });
  } catch (error) {
    return resError({ developer_msg: `saveStorefrontDomain failed: ${error}` });
  }
};

/** Admin: check the TXT record `_deskflow-verify.<domain>` holds our token. */
export const verifyStorefrontDomain = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!company_masters_id) return resBadRequest({ developer_msg: "Company context missing" });
    const row = await storefrontDomainModel.findOne({ where: { company_masters_id, isDelete: 0 } });
    if (!row) return resBadRequest({ ack_msg: "Set a domain first" });

    let records = [];
    try {
      records = (await dns.resolveTxt(`${VERIFY_PREFIX}.${row.domain}`)).map((chunks) => chunks.join(""));
    } catch {
      // NXDOMAIN / no TXT yet - reported below as "not found", not an error.
    }

    if (!records.includes(row.verification_token)) {
      return resBadRequest({ ack_msg: `TXT record not found yet. Add ${VERIFY_PREFIX}.${row.domain} = ${row.verification_token} and retry (DNS can take a few minutes).` });
    }
    await row.update({ verified_at: new Date() });
    return resSuccess({ data: { item: present(row.get({ plain: true })) } });
  } catch (error) {
    return resError({ developer_msg: `verifyStorefrontDomain failed: ${error}` });
  }
};

/** PUBLIC: hostname -> company slug (qr_code, the current public lookup key). Verified domains only. */
export const resolveStorefrontDomain = async (req) => {
  try {
    const host = String(req.query?.host || "").trim().toLowerCase();
    if (!HOSTNAME_RE.test(host)) return resSuccess({ data: { item: null } });

    const row = await storefrontDomainModel.findOne({ where: { domain: host, isDelete: 0 }, raw: true });
    if (!row || !row.verified_at) return resSuccess({ data: { item: null } });

    const company = await companyModel.findOne({
      where: { id: row.company_masters_id, isDelete: 0 },
      attributes: ["qr_code"],
      raw: true,
    });
    return resSuccess({ data: { item: company?.qr_code ? { slug: company.qr_code, domain: row.domain } : null } });
  } catch (error) {
    return resError({ developer_msg: `resolveStorefrontDomain failed: ${error}` });
  }
};
