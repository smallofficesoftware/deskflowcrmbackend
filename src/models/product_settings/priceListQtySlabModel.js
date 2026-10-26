import { DOUBLE, INTEGER, TINYINT } from "sequelize";

export const priceListQtySlabModel = (sequelize) =>
  sequelize.define(
    "price_list_qty_slabs",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      a_application_login_id: { type: INTEGER },
      // 0 = the product's own base slabs.
      pricelist_masters_id: { type: INTEGER, defaultValue: 0 },
      product_id: { type: INTEGER },
      min_qty: { type: INTEGER },
      rate: { type: DOUBLE },
      net_rate: { type: DOUBLE },
      isDelete: { type: TINYINT, defaultValue: 0 },
    },
    { timestamps: false }
  );
