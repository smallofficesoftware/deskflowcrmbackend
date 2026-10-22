import { Op } from "sequelize";

// Shared slug generation for the ecommerce storefront's catalog SEO fields
// (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, Q12/4.7). Used by product
// and category create/update (src/services/product_settings/productServices.js,
// src/services/commonServices.js) - generated and stored at write time, not
// computed on every request. The one-time backfill migration
// (migration/tenant/migrations/20261021130000-...) keeps its OWN frozen copy
// of this logic rather than importing this file, deliberately - see that
// migration's own comment.

export const slugify = (text) =>
  (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Resolves collisions with a numeric suffix (-2, -3, ...). `model` must be
 * a tenant-DB Sequelize model with a `slug` column - a tenant DB is already
 * exactly one company, so no company_masters_id scoping is needed on the
 * uniqueness check itself. `excludeId` skips the row being updated, so
 * re-saving a product under its own unchanged name doesn't collide with
 * itself. */
export const generateUniqueSlug = async (model, baseText, excludeId = null) => {
  const base = slugify(baseText) || "item";
  let slug = base;
  let suffix = 2;

  while (true) {
    const where = { slug, isDelete: 0 };
    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }
    const existing = await model.findOne({ where });
    if (!existing) return slug;
    slug = `${base}-${suffix}`;
    suffix++;
  }
};
