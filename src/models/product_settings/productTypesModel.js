import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";

export const productTypesModel = (sequelize) => {

  return sequelize.define("product_types", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: STRING,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
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