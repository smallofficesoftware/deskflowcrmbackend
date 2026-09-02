/**
 * Migration Name: add-template-purpose-to-document-print-templates
 * Database Type: TENANT
 *
 * 'main' (default) -> a real doc-type template, pickable/settable-default
 * for actual order printing. 'extra_page' -> created only via the
 * "Document Designer Page" custom field's editor (data_type 14) — shares
 * this same table/doc_type so buildDesignerPageBytes can render it exactly
 * like any other template, but must be excluded from /document-designer's
 * own per-doc-type list and the real print-time picker, where it would be
 * confusable with an actual doc-type layout.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("document_print_templates");
  if (!table.template_purpose) {
    await queryInterface.addColumn("document_print_templates", "template_purpose", {
      type: Sequelize.STRING,
      defaultValue: "main",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("document_print_templates", "template_purpose");
};
