/**
 * Migration Name: add-include-product-pages
 * Database Type: TENANT
 *
 * Per-template toggle (not company-wide) — "Standard" Quotation can have
 * this on while another Quotation template has it off. Only meaningful on
 * template_purpose='main' rows of the 7 cart-shaped doc types; ignored
 * everywhere else.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("document_print_templates", "include_product_pages", {
    type: Sequelize.TINYINT,
    defaultValue: 0,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("document_print_templates", "include_product_pages");
};
