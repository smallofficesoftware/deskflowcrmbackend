/**
 * Migration Name: seed-storefront-skin-themes
 * Database Type: MASTER
 *
 * Adds eight ready-made storefront themes to the `storefront_themes` catalog. They re-skin the Pharmacy
 * theme's pages (storefront/src/themes/skins.tsx) - the `code` here must match the key in that file.
 * Idempotent: a theme whose code already exists is left alone.
 */

const THEMES = [
  ["midnight", "Midnight", "Dark mode storefront with a bright blue accent.", 1],
  ["ocean", "Ocean", "Clean white layout with a fresh sky-blue accent and rounded cards.", 2],
  ["forest", "Forest", "Natural greens on warm cream with serif headings - organic and grocery stores.", 3],
  ["sunset", "Sunset", "Warm orange-to-coral header, friendly and energetic.", 4],
  ["royal", "Royal", "Deep purple and gold with serif headings - premium and jewellery stores.", 5],
  ["rose", "Rose Boutique", "Soft pink with big rounded corners - fashion, beauty and gifts.", 6],
  ["mono", "Mono Minimal", "Black and white, sharp corners, no shadows - editorial and modern.", 7],
  ["marketplace", "Marketplace", "Dense, bold marketplace look - navy header with an amber accent.", 8],
];

export const up = async (queryInterface) => {
  for (const [code, name, description, sortOrder] of THEMES) {
    const [existing] = await queryInterface.sequelize.query("SELECT id FROM `storefront_themes` WHERE `code` = :code LIMIT 1", { replacements: { code } });
    if (existing.length > 0) continue;
    await queryInterface.sequelize.query(
      "INSERT INTO `storefront_themes` (`code`, `name`, `description`, `required_tier`, `sort_order`, `isActive`, `isDelete`) VALUES (:code, :name, :description, 'basic', :sortOrder, 1, 0)",
      { replacements: { code, name, description, sortOrder } }
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DELETE FROM `storefront_themes` WHERE `code` IN (:codes)", { replacements: { codes: THEMES.map((t) => t[0]) } });
};
