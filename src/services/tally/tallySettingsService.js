import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "tally";

// First functional slice of the Tally module (plans/2026-10-08-marketplace-
// tally-plan.txt 4.4: "Settings -> mapping -> sync -> log"). Reads/writes the
// GENERIC marketplace_addon_settings table filtered by addon_code='tally' -
// this file does not own that table, it just uses it like any addon would.

const parseJson = (value) => {
  if (typeof value !== "string") return value && typeof value === "object" ? value : {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const LEDGER_ROLES = ["sales", "round_off", "other_charges", "discount", "tcs"];

/** Stored config merged with what the screen sent. Server-side on purpose:
 *  - a save that omits a key (an older screen, a partial save) must not wipe it;
 *  - auto_sync.since_* is stamped HERE, when a switch goes from off to on, so the screen cannot
 *    backdate it and turning auto-send on can never push documents that already existed. */
const mergeConfig = (existingRaw, incomingRaw) => {
  const existing = parseJson(existingRaw);
  const incoming = parseJson(incomingRaw);
  const merged = { ...existing, ...incoming };

  if (incoming.ledgers !== undefined) {
    const ledgers = {};
    for (const role of LEDGER_ROLES) {
      const name = typeof incoming.ledgers?.[role] === "string" ? incoming.ledgers[role].trim().slice(0, 100) : "";
      if (name) ledgers[role] = name;
    }
    merged.ledgers = ledgers;
  }

  if (incoming.auto_sync !== undefined) {
    const before = existing.auto_sync || {};
    const auto = { ...before };
    for (const key of ["invoices", "receipts"]) {
      const on = Boolean(incoming.auto_sync?.[key]);
      auto[key] = on;
      if (on && !before[key]) auto[`since_${key}`] = new Date().toISOString();
    }
    merged.auto_sync = auto;
  }
  return merged;
};

export const getTallySettings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const model = marketplaceAddonSettingsModel(req.tenantDB);
    const row = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
      raw: true,
    });

    return resSuccess({ data: { item: row || null } });
  } catch (error) {
    return resError({ developer_msg: `getTallySettings failed: ${error}` });
  }
};

export const saveTallySettings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { connection_mode, direct_url_host, direct_url_port, config_json } = req.body || {};
    const model = marketplaceAddonSettingsModel(req.tenantDB);

    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
    });

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      connection_mode,
      direct_url_host,
      direct_url_port,
      config_json: mergeConfig(existing?.config_json, config_json),
      modified_date: new Date(),
    };

    const row = existing ? await existing.update(fields) : await model.create(fields);

    return resSuccess({ data: { item: row } });
  } catch (error) {
    return resError({ developer_msg: `saveTallySettings failed: ${error}` });
  }
};
