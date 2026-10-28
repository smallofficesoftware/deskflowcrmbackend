import { areaModel } from "../../models/masters/areaModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { countryModel } from "../../models/masters/countryModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyBySlug } from "./storefrontCompanyResolver.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";

// PUBLIC cascading location lookups for the storefront's own address form
// (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P3 - 23-10-2026 addition).
// a_countries/a_states/a_cities/a_areas are real, already-seeded PER-TENANT
// master tables (confirmed via create_company_copy.sql - each new company
// gets its own copy at signup), used today only through the internal,
// staff-authenticated generic `POST /commonGet`. An anonymous storefront
// customer can't use that, so these are new, narrow, read-only mirrors of
// the same tables - no write path, no internal fields exposed.
const ADDON_CODE = "ecommerce-storefront";

async function resolveAndGate(companySlug) {
  const resolved = await resolveCompanyBySlug(companySlug);
  if (!resolved) return { error: resError({ ack_msg: "Store not found" }) };

  const { enabled } = await isAppEnabledForCompany(resolved.tenantDB, resolved.company_masters_id, ADDON_CODE);
  if (!enabled) return { error: resError({ ack_msg: "This store's online ordering is not enabled." }) };

  return { resolved };
}

export const getStorefrontCountries = async (req) => {
  try {
    const { companySlug } = req.params;
    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const countries = await countryModel(resolved.tenantDB).findAll({
      where: { isDelete: 0, isActive: 1 },
      attributes: ["id", "country_name"],
      order: [["country_name", "ASC"]],
      raw: true,
    });
    return resSuccess({ data: { items: countries } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontCountries failed: ${error}` });
  }
};

export const getStorefrontStates = async (req) => {
  try {
    const { companySlug } = req.params;
    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const country_id = Number(req.query?.country_id);
    if (!country_id) return resError({ ack_msg: "country_id is required" });

    const states = await stateModel(resolved.tenantDB).findAll({
      where: { country_id, isDelete: 0, isActive: 1 },
      attributes: ["id", "state_name", "country_id"],
      order: [["state_name", "ASC"]],
      raw: true,
    });
    return resSuccess({ data: { items: states } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontStates failed: ${error}` });
  }
};

export const getStorefrontCities = async (req) => {
  try {
    const { companySlug } = req.params;
    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const state_id = Number(req.query?.state_id);
    if (!state_id) return resError({ ack_msg: "state_id is required" });

    const cities = await cityModel(resolved.tenantDB).findAll({
      where: { state_id, isDelete: 0, isActive: 1 },
      attributes: ["id", "city_name", "state_id"],
      order: [["city_name", "ASC"]],
      raw: true,
    });
    return resSuccess({ data: { items: cities } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontCities failed: ${error}` });
  }
};

export const getStorefrontAreas = async (req) => {
  try {
    const { companySlug } = req.params;
    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const city_id = Number(req.query?.city_id);
    if (!city_id) return resError({ ack_msg: "city_id is required" });

    const areas = await areaModel(resolved.tenantDB).findAll({
      where: { city_id, isDelete: 0, isActive: 1 },
      attributes: ["id", "area_name", "city_id"],
      order: [["area_name", "ASC"]],
      raw: true,
    });
    return resSuccess({ data: { items: areas } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontAreas failed: ${error}` });
  }
};
