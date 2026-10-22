import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { getVariantAttributesForParent, getVariantsForParent } from "./storefrontVariantHelpers.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyBySlug } from "./storefrontCompanyResolver.js";

// PUBLIC catalog reads (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P2/4.2) - no
// requireAddon() gate on these specifically, per 4.2's own text: "Middleware
// requireAddon('ecommerce-storefront') on every route except public catalog reads."
// An anonymous visitor/crawler on a resolved subdomain must be able to browse
// without an addon-enabled check blocking them.

const ADDON_CODE = "ecommerce-storefront";

/** Overrides a product's rate/net_rate from the company's configured default price
 * list (marketplace_addon_settings.config_json.default_price_list_id) when one is
 * set - no admin UI exists yet to configure this, so this is a no-op (keeps the
 * product's own rate/net_rate) until that field lands. Mirrors the override
 * pattern orderServices.js already uses for B2B contacts' assigned price lists,
 * just reading the ecommerce addon's own default instead of a contact's. */
const applyDefaultPriceList = async (tenantDB, company_masters_id, products) => {
  const settingsRow = await marketplaceAddonSettingsModel(tenantDB).findOne({
    where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
    raw: true,
  });
  const defaultPriceListId = settingsRow?.config_json?.default_price_list_id;
  if (!defaultPriceListId) return products;

  const productIds = products.map((p) => p.id);
  const priceRows = await priceListModel(tenantDB).findAll({
    where: { pricelist_masters_id: defaultPriceListId, product_id: productIds, isDelete: 0 },
    raw: true,
  });
  const priceByProductId = new Map(priceRows.map((r) => [r.product_id, r]));

  return products.map((p) => {
    const override = priceByProductId.get(p.id);
    return override ? { ...p, rate: override.rate, net_rate: override.net_rate } : p;
  });
};

/** GET /storefront/:companySlug/categories - full tree (top-level categories
 * with their direct subcategories nested), for nav/menus. */
export const getStorefrontCategoryTree = async (req) => {
  try {
    const { companySlug } = req.params;
    const resolved = await resolveCompanyBySlug(companySlug);
    if (!resolved) return resError({ ack_msg: "Store not found" });

    const CategoryModel = categoryModel(resolved.tenantDB);
    const all = await CategoryModel.findAll({
      where: { company_masters_id: resolved.company_masters_id, isDelete: 0 },
      attributes: ["id", "category_name", "slug", "parent_category_id"],
      order: [["category_name", "ASC"]],
      raw: true,
    });

    // Group children by their parent id first, so looking a category's children
    // up by id is correct regardless of which order the flat list came back in -
    // computing a category's own "children" inline during a single forEach pass
    // would be a stale read for any row processed before its children were seen.
    const childrenByParentId = new Map();
    all.forEach((c) => {
      const key = c.parent_category_id || null;
      if (!childrenByParentId.has(key)) childrenByParentId.set(key, []);
      childrenByParentId.get(key).push(c);
    });
    const topLevel = (childrenByParentId.get(null) || []).map((c) => ({
      ...c,
      children: childrenByParentId.get(c.id) || [],
    }));

    return resSuccess({ data: { item: topLevel } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontCategoryTree failed: ${error}` });
  }
};

/** GET /storefront/:companySlug/categories/:slug - one category (top-level or
 * subcategory - slug alone resolves it regardless of URL depth, the parent
 * segment in /category/:parentSlug/:childSlug is a display/SEO concern the
 * frontend route handles, not a second lookup key) with its direct
 * subcategories, parent (for breadcrumb), and products. */
export const getStorefrontCategoryBySlug = async (req) => {
  try {
    const { companySlug, slug } = req.params;
    const resolved = await resolveCompanyBySlug(companySlug);
    if (!resolved) return resError({ ack_msg: "Store not found" });

    const CategoryModel = categoryModel(resolved.tenantDB);
    const category = await CategoryModel.findOne({
      where: { company_masters_id: resolved.company_masters_id, slug, isDelete: 0 },
      raw: true,
    });
    if (!category) return resError({ ack_msg: "Category not found" });

    const [children, parent] = await Promise.all([
      CategoryModel.findAll({
        where: { parent_category_id: category.id, isDelete: 0 },
        attributes: ["id", "category_name", "slug"],
        raw: true,
      }),
      category.parent_category_id
        ? CategoryModel.findOne({
            where: { id: category.parent_category_id, isDelete: 0 },
            attributes: ["id", "category_name", "slug"],
            raw: true,
          })
        : null,
    ]);

    const ProductModel = productModel(resolved.tenantDB);
    const products = await ProductModel.findAll({
      where: {
        company_masters_id: resolved.company_masters_id,
        category_id: category.id,
        isDelete: 0,
        isActive: 1,
        show_in_ecommerce: 1,
        parent_product_id: null, // Parent shown as one entry, not its individual variants - same convention as Order Creation's excludeVariants.
      },
      attributes: ["id", "product_name", "slug", "meta_title", "meta_description", "rate", "net_rate", "product_img", "is_variant_parent"],
      order: [["product_name", "ASC"]],
      raw: true,
    });
    const pricedProducts = await applyDefaultPriceList(resolved.tenantDB, resolved.company_masters_id, products);

    return resSuccess({ data: { item: { category, parent, children, products: pricedProducts } } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontCategoryBySlug failed: ${error}` });
  }
};

/** GET /storefront/:companySlug/products - full catalog list. */
export const getStorefrontProducts = async (req) => {
  try {
    const { companySlug } = req.params;
    const resolved = await resolveCompanyBySlug(companySlug);
    if (!resolved) return resError({ ack_msg: "Store not found" });

    const ProductModel = productModel(resolved.tenantDB);
    const products = await ProductModel.findAll({
      where: {
        company_masters_id: resolved.company_masters_id,
        isDelete: 0,
        isActive: 1,
        show_in_ecommerce: 1,
        parent_product_id: null,
      },
      attributes: ["id", "product_name", "slug", "meta_title", "meta_description", "rate", "net_rate", "product_img", "category_id", "is_variant_parent"],
      order: [["product_name", "ASC"]],
      raw: true,
    });
    const pricedProducts = await applyDefaultPriceList(resolved.tenantDB, resolved.company_masters_id, products);

    return resSuccess({ data: { item: pricedProducts } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontProducts failed: ${error}` });
  }
};

/** GET /storefront/:companySlug/products/:slug - single product detail. A
 * Parent ("Has Variants" template) also returns its variant attributes +
 * variant list, so the frontend can render a variant picker on the same
 * page (standard ecommerce pattern) instead of needing a second request. */
export const getStorefrontProductBySlug = async (req) => {
  try {
    const { companySlug, slug } = req.params;
    const resolved = await resolveCompanyBySlug(companySlug);
    if (!resolved) return resError({ ack_msg: "Store not found" });

    const ProductModel = productModel(resolved.tenantDB);
    const product = await ProductModel.findOne({
      where: { company_masters_id: resolved.company_masters_id, slug, isDelete: 0, isActive: 1, show_in_ecommerce: 1 },
      raw: true,
    });
    if (!product) return resError({ ack_msg: "Product not found" });

    const [priced] = await applyDefaultPriceList(resolved.tenantDB, resolved.company_masters_id, [product]);

    if (Number(product.is_variant_parent) === 1) {
      const [attributes, variants] = await Promise.all([
        getVariantAttributesForParent(resolved.tenantDB, resolved.company_masters_id, product.id),
        getVariantsForParent(resolved.tenantDB, product.id),
      ]);
      const visibleVariants = variants.filter((v) => Number(v.show_in_ecommerce) !== 0);
      return resSuccess({ data: { item: { product: priced, attributes, variants: visibleVariants } } });
    }

    return resSuccess({ data: { item: { product: priced } } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontProductBySlug failed: ${error}` });
  }
};
