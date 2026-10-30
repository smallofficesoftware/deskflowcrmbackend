import companyModel from "../../models/company_setup/companyModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";

// "Republish site" (CRM > Ecommerce settings): the storefront keeps its catalog (products, prices, categories, store
// info) for a day for visitors who are not logged in. This asks the storefront to drop its copy for this company, so the
// next visit shows what is in the CRM now.
//
// Needs two env vars on this backend: STOREFRONT_REVALIDATE_URL (the storefront's own base URL, e.g.
// http://localhost:3002 on the same server) and STOREFRONT_REVALIDATE_SECRET (same value as the storefront's).

/** Asks the storefront to drop its cached copy for one company. Returns { ok, message }; never throws. */
const republishCompany = async (companyId) => {
  const baseUrl = String(process.env.STOREFRONT_REVALIDATE_URL || "").replace(/\/$/, "");
  const secret = process.env.STOREFRONT_REVALIDATE_SECRET;
  if (!companyId) return { ok: false, message: "Company not found" };
  if (!baseUrl || !secret) return { ok: false, message: "Republish is not set up on this server yet." };
  try {
    // The storefront's slug for a company is its public QR code (see storefrontCompanyResolver.js).
    const company = await companyModel.findOne({ where: { id: companyId, isDelete: 0 }, attributes: ["qr_code"], raw: true });
    if (!company?.qr_code) return { ok: false, message: "This company has no store address yet." };
    const response = await fetch(`${baseUrl}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ slug: company.qr_code }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, message: "The storefront did not accept the request. Please try again." };
    return { ok: true, message: "" };
  } catch (error) {
    console.error("storefront republish failed", error);
    return { ok: false, message: "Could not reach the storefront. Please try again." };
  }
};

/** After a settings change (theme, accent colour, logo, favicon, prices...) the store's cached info is out of date:
 * refresh it now, in the background. A failure only means visitors see the change after the cache expires. */
export const triggerStorefrontRepublish = (companyId) => {
  republishCompany(companyId);
};

/** POST /storefront/republish - the "Republish site" button. */
export const republishStorefront = async (req) => {
  const result = await republishCompany(req.user?.companyId);
  if (!result.ok) return resError({ ack_msg: result.message });
  return resSuccess({ data: { item: { republished: true } } });
};
