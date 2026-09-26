/**
 * Migration Name: create-form-builder-custom-lists
 * Database Type: TENANT
 *
 * Form Builder "custom lists" (plan item E1): reusable pick-lists such as
 * Division, Department, Site or Project that a company builds itself inside
 * Form Builder (the CRM has no Division master). A form's Reference field
 * points at one with master = "custom:<list id>" and stores the item id.
 * Items are soft-deleted so a saved entry keeps showing its old label.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_custom_lists", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    name: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    created_by_a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
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

  await queryInterface.createTable("form_builder_custom_list_items", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    list_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    label: {
      type: Sequelize.STRING(150),
      allowNull: false,
    },
    display_order: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
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

  await queryInterface.addIndex("form_builder_custom_list_items", {
    fields: ["list_id", "isDelete", "display_order"],
    name: "idx_form_builder_custom_list_items_list",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_custom_list_items");
  await queryInterface.dropTable("form_builder_custom_lists");
};
