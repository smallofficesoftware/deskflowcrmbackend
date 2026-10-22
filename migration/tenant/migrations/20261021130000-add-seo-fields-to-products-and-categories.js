/**
 * Migration Name: add-seo-fields-to-products-and-categories
 * Database Type: TENANT
 * Created: 21/10/2026
 *
 * SEO columns for the ecommerce storefront's catalog pages (plans/2026-10-15-
 * ecommerce-b2b-b2c-plan.txt, Q12/4.7, P2). Auto-generated at create/update
 * time (src/utils/slugify.js), not admin-editable in phase 1 - per the user,
 * no dedicated admin UI for these yet. slug is unique within this tenant DB
 * (a tenant DB is already exactly one company, so no company_masters_id
 * scoping needed on the uniqueness check itself). Backfills existing rows so
 * P2's catalog endpoints have real slugs for already-existing products/
 * categories, not just ones created after this migration.
 */

// Inlined rather than importing src/utils/slugify.js - a migration must keep
// producing the same result years from now even if the live app's slugify
// logic changes later, so it carries its own frozen copy instead of a
// dependency on application code.
const slugify = (text) =>
  (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

const addSeoColumns = async (queryInterface, Sequelize, table) => {
  if (!(await columnExists(queryInterface, table, "slug"))) {
    await queryInterface.addColumn(table, "slug", { type: Sequelize.STRING(255), allowNull: true });
  }
  if (!(await columnExists(queryInterface, table, "meta_title"))) {
    await queryInterface.addColumn(table, "meta_title", { type: Sequelize.STRING(255), allowNull: true });
  }
  if (!(await columnExists(queryInterface, table, "meta_description"))) {
    await queryInterface.addColumn(table, "meta_description", { type: Sequelize.STRING(500), allowNull: true });
  }
};

/** Backfill: one pass per table, in-memory uniqueness check against slugs
 * already assigned earlier in THIS same backfill run (sequential, not
 * parallel, so two rows with the same name never race each other into the
 * same slug). */
const backfillSlugs = async (queryInterface, table, nameColumn, descriptionColumn) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id, \`${nameColumn}\`${descriptionColumn ? `, \`${descriptionColumn}\`` : ""} FROM \`${table}\` WHERE slug IS NULL OR slug = ''`
  );

  const usedSlugs = new Set();
  const [existing] = await queryInterface.sequelize.query(
    `SELECT slug FROM \`${table}\` WHERE slug IS NOT NULL AND slug != ''`
  );
  existing.forEach((r) => usedSlugs.add(r.slug));

  for (const row of rows) {
    const base = slugify(row[nameColumn]) || `item-${row.id}`;
    let slug = base;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix++;
    }
    usedSlugs.add(slug);

    const metaTitle = (row[nameColumn] || "").toString().slice(0, 255);
    const metaDescription = descriptionColumn
      ? (row[descriptionColumn] || "").toString().replace(/<[^>]*>/g, "").slice(0, 500)
      : null;

    await queryInterface.sequelize.query(
      `UPDATE \`${table}\` SET slug = ?, meta_title = ?, meta_description = ? WHERE id = ?`,
      { replacements: [slug, metaTitle, metaDescription, row.id] }
    );
  }
};

export const up = async (queryInterface, Sequelize) => {
  await addSeoColumns(queryInterface, Sequelize, "products");
  await addSeoColumns(queryInterface, Sequelize, "categories");

  await backfillSlugs(queryInterface, "products", "product_name", "product_description");
  await backfillSlugs(queryInterface, "categories", "category_name", null);
};

export const down = async (queryInterface) => {
  for (const table of ["products", "categories"]) {
    for (const column of ["slug", "meta_title", "meta_description"]) {
      if (await columnExists(queryInterface, table, column)) {
        await queryInterface.removeColumn(table, column);
      }
    }
  }
};
