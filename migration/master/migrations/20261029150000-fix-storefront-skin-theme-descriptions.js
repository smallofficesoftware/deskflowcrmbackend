/**
 * Migration Name: fix-storefront-skin-theme-descriptions
 * Database Type: MASTER
 *
 * The storefront now uses Poppins everywhere, so the Forest and Royal themes no longer have serif headings.
 * Updates their catalog descriptions to match.
 */

const DESCRIPTIONS = {
  forest: "Natural greens on warm cream - organic and grocery stores.",
  royal: "Deep purple and gold - premium and jewellery stores.",
};

export const up = async (queryInterface) => {
  for (const [code, description] of Object.entries(DESCRIPTIONS)) {
    await queryInterface.sequelize.query("UPDATE `storefront_themes` SET `description` = :description WHERE `code` = :code", { replacements: { code, description } });
  }
};

export const down = async () => {};
