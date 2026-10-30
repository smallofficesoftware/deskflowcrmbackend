import { Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { normalizeSellerIds } from "./productSellerGuard.js";

// Sellers column of the product Excel update sheet. The sheet shows team members by name (their login username),
// comma separated: "Bansi, Nehal". "All" means everyone may sell the product (products.sellers_a_application_login_id
// empty). A blank cell or a sheet without the column leaves the product's sellers as they are, so an old sheet can
// never clear a restriction by accident.

export const SELLERS_COLUMN = "sellers";
export const SELLERS_EVERYONE = "All";

const key = (name) => String(name || "").trim().toLowerCase();

/** The company's active team members: { byId: id -> name, idsByName: lower-case name -> [ids] }. */
export const loadSellerDirectory = async (companyId) => {
  const links = await companyVsApplicationLoginModel.findAll({
    where: { company_masters_id: companyId, isDelete: 0 },
    attributes: ["a_application_login_id"],
    raw: true,
  });
  const loginIds = [...new Set(links.map((l) => Number(l.a_application_login_id)).filter(Boolean))];
  const logins = loginIds.length
    ? await loginModel.findAll({
        where: { id: { [Op.in]: loginIds }, isDelete: 0 },
        attributes: ["id", "username"],
        raw: true,
      })
    : [];

  const byId = new Map();
  const idsByName = new Map();
  logins.forEach((l) => {
    const name = String(l.username || "").trim();
    if (!name) return;
    byId.set(Number(l.id), name);
    const ids = idsByName.get(key(name)) || [];
    ids.push(Number(l.id));
    idsByName.set(key(name), ids);
  });
  return { byId, idsByName };
};

/** The sheet text for a stored list: names joined by commas, "All" when nobody is picked. Ids that no longer belong to
 * an active team member are left out. A list made only of such ids exports blank, not "All": re-importing the sheet
 * then leaves the product alone instead of silently opening it to everyone. */
export const sellersToSheetText = (storedIds, directory) => {
  const stored = String(storedIds || "").trim();
  if (!stored) return SELLERS_EVERYONE;
  const names = stored
    .split(",")
    .map((id) => directory.byId.get(Number(id.trim())))
    .filter(Boolean);
  return names.join(", ");
};

/**
 * One sheet cell -> what to do with the product.
 *  { action: "keep" }                  blank cell: leave sellers unchanged
 *  { action: "set", value }            value for sellers_a_application_login_id (null = everyone)
 *  { action: "invalid", unknown, ambiguous }   names that match nobody / more than one team member
 */
export const parseSellersCell = (cell, directory) => {
  const text = String(cell ?? "").trim();
  if (!text) return { action: "keep" };
  if (key(text) === key(SELLERS_EVERYONE) || key(text) === "everyone") return { action: "set", value: null };

  const names = text.split(",").map((n) => n.trim()).filter(Boolean);
  const ids = [];
  const unknown = [];
  const ambiguous = [];
  names.forEach((name) => {
    const matches = directory.idsByName.get(key(name)) || [];
    if (matches.length === 1) ids.push(matches[0]);
    else if (matches.length === 0) unknown.push(name);
    else ambiguous.push(name);
  });
  if (unknown.length || ambiguous.length) return { action: "invalid", unknown, ambiguous };
  return { action: "set", value: normalizeSellerIds(ids) };
};
