/**
 * Migration Name: create-document-print-template-versions
 * Database Type: TENANT
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("document_print_template_versions", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    document_template_id: {
      type: Sequelize.INTEGER,
    },
    version_number: {
      type: Sequelize.INTEGER,
    },
    template_json: {
      type: Sequelize.TEXT("long"),
    },
    change_note: {
      type: Sequelize.STRING,
    },
    modify_by: {
      type: Sequelize.INTEGER,
    },
    created_date_time: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  });

  await queryInterface.addIndex("document_print_template_versions", {
    fields: ["document_template_id"],
    name: "idx_document_print_template_versions_template",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("document_print_template_versions");
};
