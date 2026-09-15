/**
 * Migration Name: add-system-template-id-to-document-print-templates
 * Database Type: TENANT
 *
 * Nullable reference to the system_document_templates row a company's own
 * template was created FROM via "Copy from Gallery" (copyFromSystemTemplate,
 * documentPrintTemplateServices.js) — previously only recorded once, buried
 * in that action's audit-log details, not on the row itself. Lets Document
 * Designer offer "Reset to Default" for a template that came from the
 * gallery: re-fetch that system template's CURRENT template_json and
 * overwrite the draft with it. A template built from scratch (never copied
 * from the gallery) has this null and gets no such option.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("document_print_templates");
  if (!table.system_template_id) {
    await queryInterface.addColumn("document_print_templates", "system_template_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("document_print_templates", "system_template_id");
};
