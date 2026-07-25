import { INTEGER, STRING, TINYINT } from "sequelize";

export const cityModel = (sequelize) => {

  return sequelize.define("a_cities", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    city_name: {
      type: STRING,
    },
    state_id: {
      type: INTEGER,
    },
    country_id: {
      type: INTEGER,
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