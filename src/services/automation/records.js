import { Op, QueryTypes } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { RECORD_TYPE_TO_TABLE } from "./constants.js";

// Generic record reads used by emit (pre-read + trigger context) and nodes.
// Raw SQL by table name so no model registration is needed.

const IDENT = /^[a-z_][a-z0-9_]*$/i;
// Bulk UI actions (assign to all filtered contacts) can touch thousands of rows.
const PRE_READ_LIMIT = 2000;
const assertIdent = (name) => {
  if (!IDENT.test(String(name))) throw new Error(`Invalid identifier: ${name}`);
  return name;
};

export const fetchRowsByIds = async (tenantDB, table, ids) => {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean))];
  if (!list.length) return [];
  return tenantDB.query(`SELECT * FROM \`${assertIdent(table)}\` WHERE \`id\` IN (:ids)`, {
    replacements: { ids: list },
    type: QueryTypes.SELECT,
  });
};

export const fetchRowById = async (tenantDB, table, id) => (await fetchRowsByIds(tenantDB, table, id))[0] || null;

/** Pre-read rows matching a Sequelize-style where (object or JSON string). */
export const fetchRowsByWhere = async (tenantDB, table, where) => {
  let w = where;
  if (typeof w === "string") {
    try {
      w = JSON.parse(w);
    } catch {
      return [];
    }
  }
  if (!w || typeof w !== "object") return [];
  // Reflect.ownKeys so Sequelize operator (symbol) keys count too.
  if (w.id !== undefined && Reflect.ownKeys(w).length === 1) return fetchRowsByIds(tenantDB, table, w.id);
  return tenantDB.getQueryInterface().select(null, assertIdent(table), { where: w, raw: true, limit: PRE_READ_LIMIT });
};

/** Contact id column differs per table. */
export const contactIdOf = (recordType, row) => {
  if (!row) return null;
  if (recordType === "contact") return row.id;
  return (
    row.contact_master_id ||
    row.contact_masters_id ||
    row.to_customer_id ||
    row.contact_id ||
    null
  );
};

const USER_ATTRS = [
  "id",
  "username",
  "recovery_email",
  "recovery_mobile",
  "reporting_member",
  "host_out_going_mail",
  "port_mail_setup",
  "mail_id_setup",
  "password_mail_setup",
  "web_refresh_token",
  "android_refresh_token",
  "ios_refresh_token",
];

/** Master-DB user row (a_application_logins). */
export const fetchUser = async (id) => {
  if (!id) return null;
  return loginModel.findOne({ where: { id, isDelete: 0 }, attributes: USER_ATTRS, raw: true });
};

export const fetchUsers = async (ids) => {
  const list = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!list.length) return [];
  return loginModel.findAll({ where: { id: { [Op.in]: list }, isDelete: 0 }, attributes: USER_ATTRS, raw: true });
};

/** Public shape of a user for the flow context (no secrets). */
export const publicUser = (u) =>
  u ? { id: u.id, name: u.username, email: u.recovery_email, mobile: u.recovery_mobile, reporting_member: u.reporting_member } : null;

/** First assigned user id (columns may hold "12" or "12,15"). */
export const firstUserId = (value) => {
  if (value == null || value === "") return null;
  const n = Number(String(value).split(",")[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const tableFor = (recordType) => RECORD_TYPE_TO_TABLE[recordType] || null;
