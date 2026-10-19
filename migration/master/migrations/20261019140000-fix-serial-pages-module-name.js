/**
 * Migration Name: fix-serial-pages-module-name
 * Database Type: MASTER
 *
 * Team Rights lists each page by `modual_name`, and for every other page that
 * equals the page name. The two serial report pages were created with
 * modual_name = 'Product', so they showed up as a row called "Product" and
 * could not be found by name. Make the label match the page name.
 */

const LABELS = [
  ["serial_number_stock_check", "Serial Number Wise Stock Check"],
  ["serial_number_trace", "Serial Number Trace"],
];

export const up = async (queryInterface) => {
  for (const [slug, label] of LABELS) {
    await queryInterface.sequelize.query(
      "UPDATE `a_application_pages` SET `modual_name` = :label WHERE `page_slug` = :slug AND `modual_name` = 'Product'",
      { replacements: { slug, label } }
    );
  }
};

export const down = async (queryInterface) => {
  for (const [slug] of LABELS) {
    await queryInterface.sequelize.query(
      "UPDATE `a_application_pages` SET `modual_name` = 'Product' WHERE `page_slug` = :slug",
      { replacements: { slug } }
    );
  }
};
