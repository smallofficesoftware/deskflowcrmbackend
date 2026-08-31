/**
 * Migration Name: create-system-document-templates
 * Database Type: MASTER
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("system_document_templates", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    doc_type: {
      type: Sequelize.STRING,
    },
    template_name: {
      type: Sequelize.STRING,
    },
    description: {
      type: Sequelize.STRING,
    },
    template_json: {
      type: Sequelize.TEXT("long"),
    },
    display_order: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    isActive: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
  });

  await queryInterface.addIndex("system_document_templates", {
    fields: ["doc_type"],
    name: "idx_system_document_templates_doc_type",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("system_document_templates");
};
