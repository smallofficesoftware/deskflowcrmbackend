import { DATE, DOUBLE, INTEGER, STRING, TINYINT } from "sequelize";
export const priceListModel = (sequelize) => {

  return sequelize.define("price_lists", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    pricelist_masters_id: {
      type: INTEGER,
    },
    company_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    product_id: {
      type: INTEGER,
    },
    rate: {
      type: DOUBLE,
    },
    discount: {
      type: DOUBLE,
    },
    discount_amount: {
      type: DOUBLE,
    },
    net_rate: {
      type: DOUBLE,
    },
    created_date_time: {
      type: STRING,
    },
    last_updated_date_time: {
      type: DATE,
    },
    last_updated_by: {
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

