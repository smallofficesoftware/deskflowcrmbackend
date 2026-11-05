import { Op, fn, col } from "sequelize";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/**
 * POST /api-access/product-groups
 * Body (all optional): page (1), limit (100, max 500), searchTerm, includeEmpty (true: also groups with no products).
 * Lists the company's product groups, including the shared default group (company 0), each with the number of
 * categories and products in it. Read-only.
 */
export const listApiProductGroups = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const body = req.body || {};
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));

    // product_count: simple products and variant parents (variants are counted under their parent).
    const productRows = await productModel(req.tenantDB).findAll({
      where: { isDelete: 0, parent_product_id: null, product_group_id: { [Op.ne]: null } },
      attributes: ["product_group_id", [fn("COUNT", col("id")), "n"]],
      group: ["product_group_id"],
      raw: true,
    });
    const productCount = new Map(productRows.map((r) => [r.product_group_id, Number(r.n)]));

    const categoryRows = await categoryModel(req.tenantDB).findAll({
      where: { isDelete: 0, group_id: { [Op.ne]: null } },
      attributes: ["group_id", [fn("COUNT", col("id")), "n"]],
      group: ["group_id"],
      raw: true,
    });
    const categoryCount = new Map(categoryRows.map((r) => [r.group_id, Number(r.n)]));

    // company 0 = the shared default group every company's categories can use.
    const where = { company_masters_id: { [Op.in]: [company_masters_id, 0] }, isDelete: 0 };
    const term = String(body.searchTerm || "").trim();
    if (term) where.group_name = { [Op.like]: `%${term}%` };
    if (body.includeEmpty === false) where.id = { [Op.in]: [...productCount.keys()] };

    const { rows, count } = await productGroupModel(req.tenantDB).findAndCountAll({
      where,
      order: [["group_name", "ASC"], ["id", "ASC"]],
      limit,
      offset: (page - 1) * limit,
      raw: true,
    });

    const items = rows.map((g) => ({
      id: g.id,
      group_name: g.group_name,
      group_color: g.group_color || null,
      category_count: categoryCount.get(g.id) || 0,
      product_count: productCount.get(g.id) || 0,
    }));

    return resSuccess({ data: { item: items, pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) } } });
  } catch (error) {
    return resError({ developer_msg: `listApiProductGroups failed: ${error}` });
  }
};
