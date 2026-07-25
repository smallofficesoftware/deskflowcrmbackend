import { INTEGER, STRING, TINYINT } from "sequelize";
export const stateModel = (sequelize) => {

  return sequelize.define("a_states", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    state_name: {
      type: STRING,
    },
    country_id: {
      type: INTEGER
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