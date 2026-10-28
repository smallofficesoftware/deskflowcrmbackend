import { getTenantDB } from "../../config/dbManager.js";
import companyModel from "../../models/company_setup/companyModel.js";

// Resolves a storefront's public URL company segment to a tenant DB connection.
// Shared by every public storefront endpoint (catalog reads here, and
// src/services/apps/appsService.js's gating-status check) - one resolution
// function, not copy-pasted per endpoint.
//
// STUB (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, Q8/4.3a - real subdomain +
// custom-domain resolution is its own infra-heavy slice, not built yet):
// `companySlug` is matched against the EXISTING company_masters.qr_code column,
// the same public lookup key the old online-store module already uses
// (onlineStoreService.js) - reused here rather than inventing a parallel
// mechanism, until a dedicated subdomain/slug column exists. Callers don't
// need to change when that lands - only this function's lookup column does.
export const resolveCompanyBySlug = async (companySlug) => {
  if (!companySlug) return null;

  const companyData = await companyModel.findOne({
    where: { qr_code: companySlug, isDelete: 0 },
    attributes: ["id", "a_application_login_id", "qr_code"],
  });
  if (!companyData) return null;

  const company_masters_id = companyData.dataValues.id;
  const a_application_login_id = companyData.dataValues.a_application_login_id;
  const tenantDBInfo = await getTenantDB(a_application_login_id, company_masters_id);
  if (!tenantDBInfo?.sequelize) return null;

  return { company_masters_id, a_application_login_id, tenantDB: tenantDBInfo.sequelize };
};
