/**
 * Migration Name: add-carts-designer-page-columns
 * Database Type: TENANT
 *
 * The "Document Designer Page" custom field type (data_type 14, form_type
 * 5-11) had no physical carts_column_* slots — src/utils/sharedFunctions.js's
 * getColumnName() builds a field's reference_column_name from a LOCAL
 * orderTypesCustomInquiryList that only went up to id 13 ("attechments"),
 * so a data_type=14 field's generated name (`carts_column__N`, the type
 * segment empty) never matched any real column. Adds the same 5-slot
 * (CUSTOM_FORM_FEILD_LIMIT) pattern every other data type already has,
 * matching Page Url's VARCHAR(255) shape (both store a short reference
 * string — a document_print_templates id here, not free text).
 */

export const up = async (queryInterface, Sequelize) => {
  for (let i = 1; i <= 5; i++) {
    await queryInterface.addColumn("carts", `carts_column_designer_page_${i}`, {
      type: Sequelize.STRING(255),
      allowNull: false,
      defaultValue: "",
    });
  }
};

export const down = async (queryInterface) => {
  for (let i = 1; i <= 5; i++) {
    await queryInterface.removeColumn("carts", `carts_column_designer_page_${i}`);
  }
};
