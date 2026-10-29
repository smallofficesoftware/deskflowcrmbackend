/**
 * Migration Name: rename-pharmacy-storefront-theme
 * Database Type: MASTER
 *
 * The default storefront theme was catalogued as "Pharmacy - ported from a purchased ThemeForest template". It is the
 * base layout every other theme builds on and the default for stores that never picked one, so it stays (code
 * 'pharmacy' is unchanged - the storefront and the stores' saved picks refer to it), but it is shown as a neutral
 * "Classic" with a plain description.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "UPDATE `storefront_themes` SET `name` = 'Classic', `description` = 'Clean light layout with product cards and a sidebar. Buttons, prices and the menu underline follow your Accent Colour.' WHERE `code` = 'pharmacy'"
  );
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "UPDATE `storefront_themes` SET `name` = 'Pharmacy', `description` = 'Pharmacy storefront theme, ported from a purchased ThemeForest template (customerdata/pharmacy-template-extract/).' WHERE `code` = 'pharmacy'"
  );
};
