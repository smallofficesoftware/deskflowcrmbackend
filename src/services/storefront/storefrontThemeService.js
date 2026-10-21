import storefrontThemeModel from "../../models/storefront/storefrontThemeModel.js";
import { companyStorefrontThemeModel } from "../../models/storefront/companyStorefrontThemeModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Theme picker for the ecommerce storefront addon's CRM admin settings page
// (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, 4.6). Tier-filtering (hiding
// themes above the company's Customer Panel tier) is a no-op for now - the
// license_number bridge (Q1) that would resolve a company's tier doesn't
// exist yet, and there is only one theme (Pharmacy, 'basic') either way, so
// every enabled company already qualifies. Revisit the filter once both the
// bridge lands and a second, 'advanced' theme actually exists to hide.

export const getStorefrontThemes = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const themes = await storefrontThemeModel.findAll({
      where: { isDelete: 0, isActive: 1 },
      order: [["sort_order", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    const CompanyThemeModel = companyStorefrontThemeModel(req.tenantDB);
    const current = await CompanyThemeModel.findOne({
      where: { company_masters_id, isDelete: 0 },
      raw: true,
    });

    return resSuccess({
      data: { item: { themes, current_theme_id: current?.storefront_theme_id || null } },
    });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontThemes failed: ${error}` });
  }
};

export const selectStorefrontTheme = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { storefront_theme_id } = req.body || {};
    if (!storefront_theme_id) {
      return resBadRequest({ developer_msg: "storefront_theme_id is required" });
    }

    const theme = await storefrontThemeModel.findOne({
      where: { id: storefront_theme_id, isDelete: 0, isActive: 1 },
      raw: true,
    });
    if (!theme) {
      return resError({ ack_msg: "Theme not found", developer_msg: `No active storefront_themes row for id=${storefront_theme_id}` });
    }

    const CompanyThemeModel = companyStorefrontThemeModel(req.tenantDB);
    const existing = await CompanyThemeModel.findOne({ where: { company_masters_id, isDelete: 0 } });

    const fields = {
      company_masters_id,
      storefront_theme_id,
      activated_date: new Date(),
    };
    const row = existing ? await existing.update(fields) : await CompanyThemeModel.create(fields);

    return resSuccess({ data: { item: row } });
  } catch (error) {
    return resError({ developer_msg: `selectStorefrontTheme failed: ${error}` });
  }
};
