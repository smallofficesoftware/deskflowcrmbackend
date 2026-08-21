import moment from "moment";
import companyFeatureFlagModel from "../../models/company_setup/companyFeatureFlagModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";

// Plain-argument helper (not (req)-shaped) so callers like orderServices.js's
// generate flow can gate a feature without going through the request/response
// cycle — this is called from deep inside a service, not from a route.
export const isFeatureEnabled = async (company_masters_id, feature_key) => {
  if (!company_masters_id || !feature_key) return false;
  const row = await companyFeatureFlagModel.findOne({
    where: { company_masters_id, feature_key, isDelete: 0 },
    attributes: ["is_enabled"],
  });
  return row?.is_enabled == 1;
};

// Upsert-by-lookup, same pattern as printSettingServices.js's printsetting().
export const setFeatureEnabled = async (company_masters_id, feature_key, is_enabled) => {
  const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

  const existing = await companyFeatureFlagModel.findOne({
    where: { company_masters_id, feature_key, isDelete: 0 },
    attributes: ["id"],
  });

  if (existing?.id) {
    await companyFeatureFlagModel.update(
      { is_enabled: is_enabled ? 1 : 0, modified_date: formattedDateTime },
      { where: { id: existing.id } }
    );
    return existing.id;
  }

  const created = await companyFeatureFlagModel.create({
    company_masters_id,
    feature_key,
    is_enabled: is_enabled ? 1 : 0,
    created_date_time: formattedDateTime,
  });
  return created.id;
};

// Route-facing read wrapper — symmetric with setFeatureFlag, so the admin
// toggle UI (NewModuleSettings.tsx) can initialize its checked state on mount.
export const getFeatureFlag = async (req) => {
  try {
    const { company_masters_id, feature_key } = req.body || {};
    if (!company_masters_id || !feature_key) {
      return resError({ developer_msg: "company_masters_id and feature_key are required" });
    }
    const is_enabled = await isFeatureEnabled(company_masters_id, feature_key);
    return resSuccess({ data: { item: { is_enabled } } });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Route-facing wrapper — the (req) shape callServiceMethod expects.
export const setFeatureFlag = async (req) => {
  try {
    const { company_masters_id, feature_key, is_enabled } = req.body || {};

    if (!company_masters_id || !feature_key) {
      return resError({ developer_msg: "company_masters_id and feature_key are required" });
    }

    await setFeatureEnabled(company_masters_id, feature_key, is_enabled);

    return resSuccess({ ack_msg: "Feature flag updated successfully" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
