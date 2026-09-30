import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

export const formBuilderCustomListModel = (sequelize) => {
  return sequelize.define(
    "form_builder_custom_lists",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      name: { type: STRING(100) },
      created_by_a_application_login_id: { type: INTEGER },
      created_date_time: { type: DATE },
      isDelete: { type: TINYINT, defaultValue: 0 },
      isActive: { type: TINYINT, defaultValue: 1 },
    },
    { timestamps: false },
  );
};

export const formBuilderCustomListItemModel = (sequelize) => {
  return sequelize.define(
    "form_builder_custom_list_items",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      list_id: { type: INTEGER },
      label: { type: STRING(150) },
      display_order: { type: INTEGER, defaultValue: 0 },
      created_date_time: { type: DATE },
      isDelete: { type: TINYINT, defaultValue: 0 },
      isActive: { type: TINYINT, defaultValue: 1 },
    },
    { timestamps: false },
  );
};
