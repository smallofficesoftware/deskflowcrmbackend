/**
 * Migration Name: create-document-print-templates
 * Database Type: TENANT
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("document_print_templates", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
    },
    doc_type: {
      type: Sequelize.STRING,
    },
    template_name: {
      type: Sequelize.STRING,
    },
    draft_template_json: {
      type: Sequelize.TEXT("long"),
    },
    published_template_json: {
      type: Sequelize.TEXT("long"),
    },
    has_unpublished_changes: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    is_default: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    display_order: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    created_date_time: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    modified_date: {
      type: Sequelize.DATE,
    },
    modify_by: {
      type: Sequelize.INTEGER,
    },
    s_timestemp: {
      type: Sequelize.STRING,
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

  await queryInterface.addIndex("document_print_templates", {
    fields: ["company_masters_id", "doc_type"],
    name: "idx_document_print_templates_company_doctype",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("document_print_templates");
};
