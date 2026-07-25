import { INTEGER, STRING, TINYINT } from "sequelize";

export const priceListMastersModel = (sequelize) => {
  return sequelize.define("pricelist_masters", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    price_list_name: {
      type: STRING
    },
    company_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    effective_from: {
      type: STRING,
    },
    country_id: {
      type: INTEGER,
    },
    state_id: {
      type: INTEGER,
    },
    city_id: {
      type: INTEGER,
    },
    created_date_time: {
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

