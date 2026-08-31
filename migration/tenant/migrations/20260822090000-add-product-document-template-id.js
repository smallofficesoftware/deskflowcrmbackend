/**
 * Migration Name: add-product-document-template-id
 * Database Type: TENANT
 *
 * "Product Page Designer" — a product can have one Document Designer page
 * (template_purpose='product_page') attached, spliced after the main
 * document at print time (generateDocument.js), one per item in cart order,
 * when the resolved main template's include_product_pages flag is on.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("products", "document_template_id", {
    type: Sequelize.INTEGER,
    allowNull: true,
    defaultValue: null,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("products", "document_template_id");
};
