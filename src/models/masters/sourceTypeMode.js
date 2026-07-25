import { INTEGER, STRING, TINYINT } from "sequelize";
export const sourceTypesModel = (sequelize) => {
  return sequelize.define("source_types", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    source_name: {
      type: STRING,
    },
    api_key: {
      type: STRING,
    },
    webhook: {
      type: STRING,
    },
    color: {
      type: STRING,
    },

    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },
    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
}
// export default sourceTypesModel;
