import { Op, fn, col } from "sequelize";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { CATEGORY_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { STOREFRONT_ADDON_CODE, resolveStorefrontBaseUrl } from "./apiAccessProductService.js";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/**
 * POST /api-access/categories
 * Body (all optional): page (1), limit (100, max 500), searchTerm, parentId (only that category's direct
 *   children; 0 = top-level only), groupId, includeEmpty (true: also categories with no products).
 * Returns a flat list - each category carries parent_category_id and product_count, plus its image URLs and,
 * when the Ecommerce Storefront addon is on, its storefront link. Read-only.
 */
export const listApiCategories = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const body = req.body || {};
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));

    const where = { isDelete: 0 };
    if (body.parentId !== undefined && body.parentId !== null && body.parentId !== "") {
      where.parent_category_id = Number(body.parentId) === 0 ? null : Number(body.parentId);
    }
    if (body.groupId) where.group_id = body.groupId;
    const term = String(body.searchTerm || "").trim();
    if (term) where.category_name = { [Op.like]: `%${term}%` };

    // product_count: simple products and variant parents in the category (variants are counted under their parent).
    const countRows = await productModel(req.tenantDB).findAll({
      where: { isDelete: 0, parent_product_id: null, category_id: { [Op.ne]: null } },
      attributes: ["category_id", [fn("COUNT", col("id")), "n"]],
      group: ["category_id"],
      raw: true,
    });
    const productCount = new Map(countRows.map((r) => [r.category_id, Number(r.n)]));
    if (body.includeEmpty === false) where.id = { [Op.in]: [...productCount.keys()] };

    const { rows, count } = await categoryModel(req.tenantDB).findAndCountAll({
      where,
      order: [["category_name", "ASC"], ["id", "ASC"]],
      limit,
      offset: (page - 1) * limit,
      raw: true,
    });
    const pagination = { page, limit, total: count, total_pages: Math.ceil(count / limit) };

    // Parent slugs (a sub-category's storefront URL is /category/<parent slug>/<its slug>) and group names.
    const parentIds = [...new Set(rows.map((r) => r.parent_category_id).filter(Boolean))];
    const parents = parentIds.length
      ? await categoryModel(req.tenantDB).findAll({ where: { id: parentIds }, attributes: ["id", "category_name", "slug"], raw: true })
      : [];
    const parentById = new Map(parents.map((p) => [p.id, p]));
    const groupIds = [...new Set(rows.map((r) => r.group_id).filter(Boolean))];
    const groups = groupIds.length
      ? await productGroupModel(req.tenantDB).findAll({ where: { id: groupIds }, attributes: ["id", "group_name"], raw: true })
      : [];
    const groupName = new Map(groups.map((g) => [g.id, g.group_name]));

    const { enabled: storefrontEnabled } = await isAppEnabledForCompany(req.tenantDB, company_masters_id, STOREFRONT_ADDON_CODE);
    const storefrontBase = storefrontEnabled ? await resolveStorefrontBaseUrl(company_masters_id) : null;
    const storefrontUrl = (c) => {
      if (!storefrontBase || !c.slug) return null;
      const parent = c.parent_category_id ? parentById.get(c.parent_category_id) : null;
      if (c.parent_category_id && !parent?.slug) return null;
      return parent ? `${storefrontBase}/category/${parent.slug}/${c.slug}` : `${storefrontBase}/category/${c.slug}`;
    };

    const items = rows.map((c) => {
      const image = (p) => (p ? CATEGORY_IMG_LINK_EXTENDED + p : null);
      const item = {
        id: c.id,
        category_name: c.category_name,
        slug: c.slug || null,
        parent_category_id: c.parent_category_id || null,
        parent_category_name: c.parent_category_id ? parentById.get(c.parent_category_id)?.category_name || "" : null,
        product_group: c.group_id ? { id: c.group_id, name: groupName.get(c.group_id) || "" } : null,
        product_count: productCount.get(c.id) || 0,
        image_url: image(c.image_path),
        webp_url: image(c.webp_path || c.image_path),
        thumbnail_url: image(c.thumbnail_path || c.image_path),
      };
      if (storefrontEnabled) item.ecommerce_url = storefrontUrl(c);
      return item;
    });

    return resSuccess({ data: { item: items, pagination, storefront_enabled: storefrontEnabled } });
  } catch (error) {
    return resError({ developer_msg: `listApiCategories failed: ${error}` });
  }
};
