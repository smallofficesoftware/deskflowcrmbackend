import { INTEGER, STRING, TINYINT } from "sequelize";

export const areaModel = (sequelize) => {

  return sequelize.define("a_areas", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    area_name: {
      type: STRING,
    },
    city_id: {
      type: INTEGER,
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