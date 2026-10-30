import { loadQtySlabs, slabsForProduct } from "./storefrontQtySlabs.js";
import storefrontDomainModel from "../../models/storefront/storefrontDomainModel.js";
import { Op, QueryTypes } from "sequelize";
import companyModel from "../../models/company_setup/companyModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import storefrontThemeModel from "../../models/storefront/storefrontThemeModel.js";
import { companyStorefrontThemeModel } from "../../models/storefront/companyStorefrontThemeModel.js";
import { customFieldsForRow, loadStorefrontCustomFieldDefs } from "./storefrontCustomFields.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productImageModel } from "../../models/product_settings/productImageModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { getVariantAttributesForParent, getVariantsForParent } from "./storefrontVariantHelpers.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyBySlug } from "./storefrontCompanyResolver.js";
import { getStorefrontAuthSettings } from "./storefrontAuthSettings.js";
import { verifySessionToken } from "./storefrontSession.js";
import { FAVICON_NAME } from "./storefrontSettingsService.js";
import { LOGO_NAME } from "./storefrontLogoService.js";
import { arePricesHidden, withoutPrices } from "./storefrontPriceVisibility.js";

// PUBLIC catalog reads (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P2/4.2) - no
// requireAddon() gate on these specifically, per 4.2's own text: "Middleware
// requireAddon('ecommerce-storefront') on every route except public catalog reads."
// An anonymous visitor/crawler on a resolved subdomain must be able to browse
// without an addon-enabled check blocking them.

const ADDON_CODE = "ecommerce-storefront";

/** "Allow public browsing" off: catalog reads need a valid storefront session for THIS
 * company (token in the `authorization` header, same convention as requireStorefrontSession).
 * Returns an error response to send, or null when access is allowed. Not applied to
 * getStorefrontCompanyInfo - the login screen needs the store's name/logo/accent. */
const requireBrowseAccess = async (req, resolved) => {
  const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
  if (settings.public_browsing_enabled !== false) return null;
  const token = req.headers.authorization;
  const session = token ? verifySessionToken(token) : null;
  if (session && Number(session.company_masters_id) === Number(resolved.company_masters_id)) return null;
  return resError({ ack_msg: "Please log in to continue.", developer_msg: "Public browsing is disabled for this store" });
};

/** Price visibility setting: when this request may not see prices, every product comes back with rate/net_rate
 * null and price_hidden true (the storefront then shows "Ask for rate"). See storefrontPriceVisibility.js. */
const maskPrices = async (req, resolved, products) => {
  const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
  return (await arePricesHidden(req, resolved, settings)) ? products.map(withoutPrices) : products;
};

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

/** Attaches each product's PRIMARY photo from product_images (plans/2026-10-20-
 * product-variant-ui-and-field-scoping-plan.txt, Phase 2) - products.product_img
 * is the legacy single-image field, already removed from the CRM frontend and
 * fully backfilled into product_images for every existing row (verified earlier
 * this session); the storefront should never read product_img directly, same
 * as the CRM no longer does. Adds `image: { webp_url, thumbnail_url } | null`
 * to each product object; callers use thumbnail_url for grids, webp_url for a
 * larger single-product view. */
const attachPrimaryImages = async (tenantDB, products) => {
  if (products.length === 0) return products;

  const images = await productImageModel(tenantDB).findAll({
    where: { product_id: products.map((p) => p.id), is_primary: 1, isDelete: 0 },
    attributes: ["product_id", "image_path", "webp_path", "thumbnail_path"],
    raw: true,
  });
  const imageByProductId = new Map(images.map((img) => [img.product_id, img]));

  return products.map((p) => {
    const img = imageByProductId.get(p.id);
    // Phase 2's backfill migration only ever set image_path (from the legacy
    // product_img column) - webp_path/thumbnail_path are generated by the upload
    // endpoint only, so a backfilled row never got them. Fall back to the
    // original (non-WebP) image rather than showing nothing for every pre-
    // existing product.
    return {
      ...p,
      image: img ? { webp_path: img.webp_path || img.image_path, thumbnail_path: img.thumbnail_path || img.image_path } : null,
    };
  });
};

/** Every non-deleted photo of each product/variant (primary first), as `images`, so the product page can
 * show a gallery - and a variant its OWN photos. attachPrimaryImages' single `image` stays for the grids. */
const attachAllImages = async (tenantDB, products) => {
  if (products.length === 0) return products;
  const rows = await productImageModel(tenantDB).findAll({
    where: { product_id: products.map((p) => p.id), isDelete: 0 },
    attributes: ["product_id", "image_path", "webp_path", "thumbnail_path"],
    order: [["is_primary", "DESC"], ["display_order", "ASC"], ["id", "ASC"]],
    raw: true,
  });
  const byProduct = new Map();
  for (const r of rows) {
    const list = byProduct.get(r.product_id) || [];
    list.push({ webp_path: r.webp_path || r.image_path, thumbnail_path: r.thumbnail_path || r.image_path });
    byProduct.set(r.product_id, list);
  }
  return products.map((p) => ({ ...p, images: byProduct.get(p.id) || [] }));
};

/** The product page used to send the whole products row to anonymous callers - purchase rate/cost, stock
 * limits, GST/HSN, internal ids. Only the fields a storefront actually renders go out. */
const PUBLIC_PRODUCT_FIELDS = [
  "id", "product_name", "slug", "meta_title", "meta_description", "product_description", "rate", "net_rate",
  "category_id", "is_variant_parent", "parent_product_id", "unit", "image", "images", "variant_options",
  // Specifications block on the product page (length / width / height as entered in the CRM, weight in grams).
  "product_length", "product_width", "product_height", "weight_or_size",
];
const toPublicProduct = (p) => Object.fromEntries(PUBLIC_PRODUCT_FIELDS.filter((k) => k in p).map((k) => [k, p[k]]));

/** GET /storefront/:companySlug/info - branding fields for generateMetadata's
 * derived OG/title defaults (plan 4.7) - company_name/company_logo/banner_img_
 * one are the only usable fields today (3.10 - no dedicated storefront SEO
 * settings exist). Separate from resolveCompanyBySlug's own company_masters_id/
 * tenantDB lookup - that one is internal plumbing, this is the public-shaped
 * subset safe to send to an anonymous caller. */
export const getStorefrontCompanyInfo = async (req) => {
  try {
    const { companySlug } = req.params;
    const resolved = await resolveCompanyBySlug(companySlug);
    if (!resolved) return resError({ ack_msg: "Store not found" });

    const company = await companyModel.findOne({
      where: { id: resolved.company_masters_id, isDelete: 0 },
      attributes: ["id", "company_name", "company_logo", "banner_img_one", "banner_img_two", "company_email", "company_contact", "address"],
      raw: true,
    });
    if (!company) return resError({ ack_msg: "Store not found" });

    // theme_accent_color (24-10-2026) - lives in the SAME marketplace_addon_
    // settings.config_json as every other storefront setting, but this
    // public/unauthenticated endpoint (not getStorefrontAuthSettings, which
    // is only ever called from already-tenant-resolved internal code) is
    // what every page actually reads company branding from, so it's merged
    // in here rather than adding a second public call just for one field.
    const settingsRow = await marketplaceAddonSettingsModel(resolved.tenantDB).findOne({
      where: { company_masters_id: resolved.company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
      attributes: ["config_json"],
      raw: true,
    });
    let config = settingsRow?.config_json;
    if (typeof config === "string") {
      try {
        config = JSON.parse(config);
      } catch {
        config = {};
      }
    }
    // Strict hex only - the storefront injects this into a <style> block.
    const accent = config?.theme_accent_color;
    company.theme_accent_color = typeof accent === "string" && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#ff0000";

    // Tab/web-app icon uploaded in the CRM settings. Only a path of exactly the shape the upload writes is
    // ever returned, so a hand-edited config_json cannot point the storefront at an arbitrary file.
    company.favicon = typeof config?.favicon_path === "string" && FAVICON_NAME.test(config.favicon_path) ? config.favicon_path : null;
    // The store's own logo (Ecommerce settings > Storefront logo); null = use the company logo. Same path check.
    company.storefront_logo = typeof config?.logo_path === "string" && LOGO_NAME.test(config.logo_path) ? config.logo_path : null;

    // Verified custom domain (Q11) - the storefront emits it as the canonical URL.
    const domainRow = await storefrontDomainModel.findOne({
      where: { company_masters_id: resolved.company_masters_id, isDelete: 0 },
      attributes: ["domain", "verified_at"],
      raw: true,
    });
    company.custom_domain = domainRow?.verified_at ? domainRow.domain : null;

    // Support tickets can be switched off in the settings; the storefront hides its Support Tickets menu item then.
    company.tickets_enabled = config?.tickets_enabled !== false;

    // The theme the admin picked in Ecommerce settings (code from the master catalog); null = the default, Pharmacy.
    company.theme_code = null;
    try {
      const picked = await companyStorefrontThemeModel(resolved.tenantDB).findOne({
        where: { company_masters_id: resolved.company_masters_id, isDelete: 0 },
        attributes: ["storefront_theme_id"],
        raw: true,
      });
      if (picked?.storefront_theme_id) {
        const theme = await storefrontThemeModel.findOne({ where: { id: picked.storefront_theme_id, isDelete: 0, isActive: 1 }, attributes: ["code"], raw: true });
        company.theme_code = theme?.code || null;
      }
    } catch (themeError) {
      console.error("storefront info: could not read the selected theme", themeError); // fall back to the default theme
    }

    return resSuccess({ data: { item: company } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontCompanyInfo failed: ${error}` });
  }
};

/** Shapes a category's own three image columns (23-10-2026 - one image per
 * category, unlike product_images' multi-row table) into the same
 * `{ webp_path, thumbnail_path }` shape attachPrimaryImages() already gives
 * products, so the frontend's existing mediaUrl()/StorefrontProductImage-
 * style handling works unchanged for categories too. */
const attachCategoryImage = (category) => {
  const { image_path, webp_path, thumbnail_path, ...rest } = category;
  return {
    ...rest,
    image: webp_path || thumbnail_path || image_path ? { webp_path: webp_path || image_path, thumbnail_path: thumbnail_path || image_path } : null,
  };
};

/** category_id -> number of products the store would list on that category's page (active, shown in the store,
 * not an individual variant). Categories missing from the map have none and are hidden from every storefront list. */
const storefrontProductCountByCategory = async (db, companyId) => {
  const rows = await db.query(
    `SELECT category_id, COUNT(*) AS n FROM products
      WHERE company_masters_id = :companyId AND isDelete = 0 AND isActive = 1 AND show_in_ecommerce = 1 AND parent_product_id IS NULL
      GROUP BY category_id`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [Number(r.category_id), Number(r.n)]));
};

/** GET /storefront/:companySlug/categories - full tree (top-level categories
 * with their direct subcategories nested), for nav/menus. */
export const getStorefrontCategoryTree = async (req) => {
  try {
    const { companySlug } = req.params;
    const resolved = await resolveCompanyBySlug(companySlug);
    if (!resolved) return resError({ ack_msg: "Store not found" });
    const denied = await requireBrowseAccess(req, resolved);
    if (denied) return denied;

    const CategoryModel = categoryModel(resolved.tenantDB);
    const all = await CategoryModel.findAll({
      where: { company_masters_id: resolved.company_masters_id, isDelete: 0 },
      attributes: ["id", "category_name", "slug", "parent_category_id", "group_id", "image_path", "webp_path", "thumbnail_path"],
      order: [["category_name", "ASC"]],
      raw: true,
    });

    // Product group names, so the header mega menu can nest Group > Category > Subcategory.
    const groupRows = await productGroupModel(resolved.tenantDB).findAll({
      // company 0 = the shared default group ("Demo Product Group", id -1) every company's categories can use.
      where: { company_masters_id: { [Op.in]: [resolved.company_masters_id, 0] }, isDelete: 0 },
      attributes: ["id", "group_name"],
      raw: true,
    });
    const groupNameById = new Map(groupRows.map((g) => [g.id, g.group_name]));

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
    // Hide categories with nothing to show: product counts use the same rules as a category page's own product
    // list (active, shown in the store, not an individual variant). A sub category stays only when it has products;
    // a top level category stays when it has products itself or any sub category that does.
    const productCount = await storefrontProductCountByCategory(resolved.tenantDB, resolved.company_masters_id);
    const topLevel = (childrenByParentId.get(null) || [])
      .map((c) => ({
        ...attachCategoryImage(c),
        group_name: groupNameById.get(c.group_id) || null,
        children: (childrenByParentId.get(c.id) || []).filter((child) => productCount.get(child.id) > 0).map(attachCategoryImage),
      }))
      .filter((c) => productCount.get(c.id) > 0 || c.children.length > 0);

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
    const denied = await requireBrowseAccess(req, resolved);
    if (denied) return denied;

    const CategoryModel = categoryModel(resolved.tenantDB);
    const category = await CategoryModel.findOne({
      where: { company_masters_id: resolved.company_masters_id, slug, isDelete: 0 },
      raw: true,
    });
    if (!category) return resError({ ack_msg: "Category not found" });

    const [childrenRaw, parentRaw] = await Promise.all([
      CategoryModel.findAll({
        where: { parent_category_id: category.id, isDelete: 0 },
        attributes: ["id", "category_name", "slug", "image_path", "webp_path", "thumbnail_path"],
        raw: true,
      }),
      category.parent_category_id
        ? CategoryModel.findOne({
            where: { id: category.parent_category_id, isDelete: 0 },
            attributes: ["id", "category_name", "slug", "image_path", "webp_path", "thumbnail_path"],
            raw: true,
          })
        : null,
    ]);
    // Sub categories with no products are hidden here too (same rule as the category tree).
    const productCount = await storefrontProductCountByCategory(resolved.tenantDB, resolved.company_masters_id);
    const children = childrenRaw.filter((child) => productCount.get(child.id) > 0).map(attachCategoryImage);
    const parent = parentRaw ? attachCategoryImage(parentRaw) : null;

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
      attributes: ["id", "product_name", "slug", "meta_title", "meta_description", "rate", "net_rate", "is_variant_parent", "unit"],
      order: [["product_name", "ASC"]],
      raw: true,
    });
    const pricedProducts = await applyDefaultPriceList(resolved.tenantDB, resolved.company_masters_id, products);
    const productsWithImages = await maskPrices(req, resolved, await attachPrimaryImages(resolved.tenantDB, pricedProducts));

    return resSuccess({ data: { item: { category: attachCategoryImage(category), parent, children, products: productsWithImages } } });
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
    const denied = await requireBrowseAccess(req, resolved);
    if (denied) return denied;

    const ProductModel = productModel(resolved.tenantDB);
    const products = await ProductModel.findAll({
      where: {
        company_masters_id: resolved.company_masters_id,
        isDelete: 0,
        isActive: 1,
        show_in_ecommerce: 1,
        parent_product_id: null,
      },
      attributes: ["id", "product_name", "slug", "meta_title", "meta_description", "rate", "net_rate", "category_id", "is_variant_parent", "unit"],
      order: [["product_name", "ASC"]],
      raw: true,
    });
    const pricedProducts = await applyDefaultPriceList(resolved.tenantDB, resolved.company_masters_id, products);
    const productsWithImages = await maskPrices(req, resolved, await attachPrimaryImages(resolved.tenantDB, pricedProducts));

    return resSuccess({ data: { item: productsWithImages } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontProducts failed: ${error}` });
  }
};

/** GET /storefront/:companySlug/search?q=... - product name/code search (24-10-2026,
 * per the user). Same scoping/shape as getStorefrontProducts above, just with a
 * LIKE filter instead of returning everything - no separate search index/table,
 * this dataset is small enough for a plain LIKE query, same as every other
 * simple text search already in this codebase. */
export const getStorefrontSearchResults = async (req) => {
  try {
    const { companySlug } = req.params;
    const q = (req.query?.q || "").trim();
    const resolved = await resolveCompanyBySlug(companySlug);
    if (!resolved) return resError({ ack_msg: "Store not found" });
    const denied = await requireBrowseAccess(req, resolved);
    if (denied) return denied;

    if (!q) return resSuccess({ data: { item: [] } });

    const ProductModel = productModel(resolved.tenantDB);
    const products = await ProductModel.findAll({
      where: {
        company_masters_id: resolved.company_masters_id,
        isDelete: 0,
        isActive: 1,
        show_in_ecommerce: 1,
        parent_product_id: null,
        [Op.or]: [{ product_name: { [Op.like]: `%${q}%` } }, { product_code: { [Op.like]: `%${q}%` } }],
      },
      attributes: ["id", "product_name", "slug", "meta_title", "meta_description", "rate", "net_rate", "category_id", "is_variant_parent", "unit"],
      order: [["product_name", "ASC"]],
      limit: 60,
      raw: true,
    });
    const pricedProducts = await applyDefaultPriceList(resolved.tenantDB, resolved.company_masters_id, products);
    const productsWithImages = await maskPrices(req, resolved, await attachPrimaryImages(resolved.tenantDB, pricedProducts));

    return resSuccess({ data: { item: productsWithImages } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontSearchResults failed: ${error}` });
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
    const denied = await requireBrowseAccess(req, resolved);
    if (denied) return denied;

    const ProductModel = productModel(resolved.tenantDB);
    const product = await ProductModel.findOne({
      where: { company_masters_id: resolved.company_masters_id, slug, isDelete: 0, isActive: 1, show_in_ecommerce: 1 },
      raw: true,
    });
    if (!product) return resError({ ack_msg: "Product not found" });

    const { product_img, ...productWithoutLegacyImage } = product;
    void product_img; // legacy single-image field - see attachPrimaryImages' own comment.
    const [priced] = await applyDefaultPriceList(resolved.tenantDB, resolved.company_masters_id, [productWithoutLegacyImage]);
    const [withPrimary] = await attachPrimaryImages(resolved.tenantDB, [priced]);
    const [withImages] = (await attachAllImages(resolved.tenantDB, [withPrimary])).map(toPublicProduct);

    // Quantity slabs for the product page's tier table. This endpoint has no
    // logged-in contact, so only the store's default list and the product's
    // own base slabs can apply; checkout re-prices with the contact's list.
    const authSettings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    const pricesHidden = await arePricesHidden(req, resolved, authSettings);
    const slabContext = await loadQtySlabs(resolved.tenantDB, {
      contactPriceListId: null,
      defaultPriceListId: authSettings.default_price_list_id || null,
      productIds: [product.id],
    });
    withImages.qty_slabs = slabsForProduct(slabContext, product.id).map((s) => ({ min_qty: s.min_qty, net_rate: s.net_rate }));
    // Product custom fields the store owner switched on ("Show On Online Store?") - shown under Specifications.
    const customFieldDefs = await loadStorefrontCustomFieldDefs(resolved.tenantDB, resolved.company_masters_id);
    withImages.custom_fields = customFieldsForRow(customFieldDefs, product, "product");

    if (Number(product.is_variant_parent) === 1) {
      const [attributes, variants] = await Promise.all([
        getVariantAttributesForParent(resolved.tenantDB, resolved.company_masters_id, product.id),
        getVariantsForParent(resolved.tenantDB, product.id),
      ]);
      const visibleVariants = variants
        .filter((v) => Number(v.show_in_ecommerce) !== 0)
        .map(({ product_img: _legacyImg, ...v }) => v); // eslint-disable-line no-unused-vars
      const variantCustomFields = new Map(visibleVariants.map((v) => [v.id, customFieldsForRow(customFieldDefs, v, "variant")]));
      const variantsWithImages = (await attachAllImages(resolved.tenantDB, await attachPrimaryImages(resolved.tenantDB, visibleVariants))).map(toPublicProduct);
      variantsWithImages.forEach((v) => {
        v.custom_fields = variantCustomFields.get(v.id) || [];
      });
      // Each variant is its own product row, so slabs are looked up per variant id.
      const variantSlabContext = await loadQtySlabs(resolved.tenantDB, {
        contactPriceListId: null,
        defaultPriceListId: authSettings.default_price_list_id || null,
        productIds: variantsWithImages.map((v) => v.id),
      });
      variantsWithImages.forEach((v) => {
        v.qty_slabs = slabsForProduct(variantSlabContext, v.id).map((s) => ({ min_qty: s.min_qty, net_rate: s.net_rate }));
      });
      return resSuccess({
        data: {
          item: {
            product: pricesHidden ? withoutPrices(withImages) : withImages,
            attributes,
            variants: pricesHidden ? variantsWithImages.map(withoutPrices) : variantsWithImages,
          },
        },
      });
    }

    return resSuccess({ data: { item: { product: pricesHidden ? withoutPrices(withImages) : withImages } } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontProductBySlug failed: ${error}` });
  }
};
