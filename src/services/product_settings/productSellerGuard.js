import { Op, Sequelize } from "sequelize";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { getCompanyByLoginId } from "../commonServices.js";

// Product-wise team assignment: products.sellers_a_application_login_id is a comma-separated
// list of the team members allowed to sell the product. Empty / NULL = everyone. A variant
// with no list of its own inherits its parent's.

const toIdList = (value) =>
  String(value || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

// Value to store: unique numeric ids joined by commas, or null for "everyone".
export const normalizeSellerIds = (value) => {
  const list = [...new Set(toIdList(Array.isArray(value) ? value.join(",") : value))];
  return list.length ? list.join(",") : null;
};

// Company owner and anyone with "all data" on the Product page are never restricted.
export const isProductSellerBypass = async (req) => {
  const loginId = Number(req.body?.a_application_login_id);
  if (!loginId) return true;

  const findCompanyId = await getCompanyByLoginId(loginId);
  if (!findCompanyId || Number(findCompanyId.company_flag) === 1) return true;

  const { showAllData } = await getUserRights({
    company_masters_id: findCompanyId.company_masters_id,
    a_application_login_id: loginId,
    page_id: PAGE_ID.PRODUCT,
    tenentId: req.tenantDB,
  });
  return Boolean(showAllData);
};

// Picker filter: a variant is allowed when its own list admits the user, or when it has
// no list and its parent's admits them. Returns null when the user is not restricted.
export const productSellerFilter = async (req) => {
  if (await isProductSellerBypass(req)) return null;

  const loginId = Number(req.body.a_application_login_id);
  const own = "products.sellers_a_application_login_id";
  const parentSellers =
    "(SELECT p.sellers_a_application_login_id FROM products p WHERE p.id = products.parent_product_id)";

  return Sequelize.literal(`(
    CASE
      WHEN ${own} IS NOT NULL AND ${own} <> '' THEN FIND_IN_SET(${loginId}, ${own}) > 0
      WHEN products.parent_product_id IS NOT NULL
        AND ${parentSellers} IS NOT NULL AND ${parentSellers} <> ''
        THEN FIND_IN_SET(${loginId}, ${parentSellers}) > 0
      ELSE 1
    END
  )`);
};

// Inquiries are saved through the generic createCommon with product_id as a comma list inside
// the JSON `data` payload; the login id may only be inside that payload too.
export const assertInquiryProductsAllowed = async (req, data) => {
  let payload = data;
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const productIds = toIdList(payload?.product_id);
  if (!productIds.length) return null;

  if (!req.body.a_application_login_id && payload?.a_application_login_id) {
    req.body.a_application_login_id = payload.a_application_login_id;
  }
  return assertProductsAllowed(req, productIds);
};

// Save-time check. Returns an error message when any product is not allowed for the
// logged-in team member, otherwise null.
export const assertProductsAllowed = async (req, productIds) => {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : [productIds]).map(Number))].filter(
    (id) => Number.isInteger(id) && id > 0
  );
  if (!ids.length) return null;
  if (await isProductSellerBypass(req)) return null;

  const loginId = Number(req.body.a_application_login_id);
  const Product = productModel(req.tenantDB);

  const rows = await Product.findAll({
    where: { id: { [Op.in]: ids }, isDelete: 0 },
    attributes: ["id", "product_name", "parent_product_id", "sellers_a_application_login_id"],
    raw: true,
  });

  const parentIds = [...new Set(rows.map((r) => r.parent_product_id).filter(Boolean))];
  const parents = parentIds.length
    ? await Product.findAll({
        where: { id: { [Op.in]: parentIds } },
        attributes: ["id", "sellers_a_application_login_id"],
        raw: true,
      })
    : [];
  const parentSellers = new Map(parents.map((p) => [p.id, p.sellers_a_application_login_id]));

  const blocked = rows.filter((row) => {
    let list = toIdList(row.sellers_a_application_login_id);
    if (!list.length && row.parent_product_id) {
      list = toIdList(parentSellers.get(row.parent_product_id));
    }
    return list.length > 0 && !list.includes(loginId);
  });

  if (!blocked.length) return null;
  const names = blocked.map((row) => row.product_name).join(", ");
  return `You are not assigned to sell: ${names}`;
};
