import { Op } from "sequelize";
import companyModel from "../../models/company_setup/companyModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productImageModel } from "../../models/product_settings/productImageModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import storefrontDomainModel from "../../models/storefront/storefrontDomainModel.js";
import { PRODUCT_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { getVariantOptionLabelsForProducts } from "../product_settings/productVariantServices.js";

export const STOREFRONT_ADDON_CODE = "ecommerce-storefront";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Combined product listing for the "API" addon: one call returns each product with its category, product
// group, every image, its variants (with their own images / option labels) and - only when the company has the
// Ecommerce Storefront addon enabled - the public storefront URL. Read-only; only fields that are safe to give an
// external system go out (no purchase rates, stock limits or internal settings). It reuses the existing product
// tables and the existing variant-label helper; no existing service is changed.

/** Base URL of the company's storefront (verified custom domain first, else <slug>.<STOREFRONT_PUBLIC_BASE>). */
export const resolveStorefrontBaseUrl = async (company_masters_id) => {
  const domainRow = await storefrontDomainModel.findOne({ where: { company_masters_id, isDelete: 0 }, raw: true });
  if (domainRow?.verified_at && domainRow.domain) return `https://${domainRow.domain}`;

  const company = await companyModel.findOne({ where: { id: company_masters_id, isDelete: "0" }, attributes: ["qr_code"], raw: true });
  if (!company?.qr_code) return null;
  const base = process.env.STOREFRONT_PUBLIC_BASE || "localhost:3002";
  const proto = /^(localhost|127\.)/.test(base) ? "http" : "https";
  return `${proto}://${company.qr_code}.${base}`;
};

const imageShape = (img) => ({
  id: img.id,
  is_primary: Boolean(img.is_primary),
  image_url: img.image_path ? PRODUCT_IMG_LINK_EXTENDED + img.image_path : null,
  webp_url: img.webp_path ? PRODUCT_IMG_LINK_EXTENDED + img.webp_path : img.image_path ? PRODUCT_IMG_LINK_EXTENDED + img.image_path : null,
  thumbnail_url: img.thumbnail_path ? PRODUCT_IMG_LINK_EXTENDED + img.thumbnail_path : img.image_path ? PRODUCT_IMG_LINK_EXTENDED + img.image_path : null,
});

const basicFields = (p) => ({
  id: p.id,
  product_name: p.product_name,
  product_code: p.product_code,
  product_alias: p.product_alias,
  product_description: p.product_description,
  product_barcode_number: p.product_barcode_number,
  unit: p.unit,
  rate: p.rate,
  net_rate: p.net_rate,
  GST: p.GST,
  hsn_code: p.hsn_code,
});

/**
 * POST /api-access/products
 * Body (all optional): page (1), limit (50, max 100), searchTerm, categoryId, groupId,
 *   includeImages (true), includeVariants (true).
 * Lists simple products and variant "parents" (a variant is returned inside its parent's `variants`).
 */
export const listApiProducts = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) return resBadRequest({ developer_msg: "Tenant DB or company context missing" });

    const body = req.body || {};
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));
    const includeImages = body.includeImages !== false;
    const includeVariants = body.includeVariants !== false;

    const where = { isDelete: 0, parent_product_id: null };
    if (body.categoryId) where.category_id = body.categoryId;
    if (body.groupId) where.product_group_id = body.groupId;
    const term = String(body.searchTerm || "").trim();
    if (term) {
      const like = { [Op.like]: `%${term}%` };
      where[Op.or] = [{ product_name: like }, { product_alias: like }, { product_code: like }, { product_barcode_number: like }];
    }

    const { rows, count } = await productModel(req.tenantDB).findAndCountAll({
      where,
      order: [["product_name", "ASC"], ["id", "ASC"]],
      limit,
      offset: (page - 1) * limit,
      raw: true,
    });

    const pagination = { page, limit, total: count, total_pages: Math.ceil(count / limit) };
    if (!rows.length) return resSuccess({ data: { item: [], pagination, storefront_enabled: false } });

    // Variants of the parents on this page.
    const parentIds = rows.filter((r) => r.is_variant_parent).map((r) => r.id);
    const variantRows =
      includeVariants && parentIds.length
        ? await productModel(req.tenantDB).findAll({
            where: { parent_product_id: { [Op.in]: parentIds }, isDelete: 0 },
            order: [["id", "ASC"]],
            raw: true,
          })
        : [];
    const optionLabels = variantRows.length ? await getVariantOptionLabelsForProducts(req.tenantDB, variantRows.map((v) => v.id)) : {};

    // Category + product group names.
    const categoryIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
    const groupIds = [...new Set(rows.map((r) => r.product_group_id).filter(Boolean))];
    const [categories, groups] = await Promise.all([
      categoryIds.length ? categoryModel(req.tenantDB).findAll({ where: { id: categoryIds }, attributes: ["id", "category_name"], raw: true }) : [],
      groupIds.length ? productGroupModel(req.tenantDB).findAll({ where: { id: groupIds }, attributes: ["id", "group_name"], raw: true }) : [],
    ]);
    const categoryName = new Map(categories.map((c) => [c.id, c.category_name]));
    const groupName = new Map(groups.map((g) => [g.id, g.group_name]));

    // Images of the products and their variants (primary first).
    const imagesByProduct = new Map();
    if (includeImages) {
      const imageRows = await productImageModel(req.tenantDB).findAll({
        where: { product_id: [...rows.map((r) => r.id), ...variantRows.map((v) => v.id)], isDelete: 0 },
        order: [["is_primary", "DESC"], ["display_order", "ASC"], ["id", "ASC"]],
        raw: true,
      });
      for (const img of imageRows) {
        const list = imagesByProduct.get(img.product_id) || [];
        list.push(imageShape(img));
        imagesByProduct.set(img.product_id, list);
      }
    }

    // Storefront URL, only when the Ecommerce Storefront addon is on for this company.
    const { enabled: storefrontEnabled } = await isAppEnabledForCompany(req.tenantDB, company_masters_id, STOREFRONT_ADDON_CODE);
    const storefrontBase = storefrontEnabled ? await resolveStorefrontBaseUrl(company_masters_id) : null;
    const storefrontUrl = (p) =>
      storefrontBase && p.slug && p.show_in_ecommerce && p.isActive ? `${storefrontBase}/products/${p.slug}` : null;

    const variantsByParent = new Map();
    for (const v of variantRows) {
      const list = variantsByParent.get(v.parent_product_id) || [];
      list.push({
        ...basicFields(v),
        variant_options: optionLabels[v.id] || [],
        images: imagesByProduct.get(v.id) || [],
      });
      variantsByParent.set(v.parent_product_id, list);
    }

    const items = rows.map((p) => {
      // A variant with no photo of its own is shown with its parent's photos.
      const images = imagesByProduct.get(p.id) || [];
      const item = {
        ...basicFields(p),
        is_variant_parent: Boolean(p.is_variant_parent),
        category: p.category_id ? { id: p.category_id, name: categoryName.get(p.category_id) || "" } : null,
        product_group: p.product_group_id ? { id: p.product_group_id, name: groupName.get(p.product_group_id) || "" } : null,
        images,
        primary_image_url: images[0]?.webp_url || null,
        variants: (variantsByParent.get(p.id) || []).map((v) => (v.images.length ? v : { ...v, images })),
      };
      if (storefrontEnabled) item.ecommerce_url = storefrontUrl(p);
      return item;
    });

    return resSuccess({ data: { item: items, pagination, storefront_enabled: storefrontEnabled } });
  } catch (error) {
    return resError({ developer_msg: `listApiProducts failed: ${error}` });
  }
};
