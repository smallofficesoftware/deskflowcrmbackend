import { DATE, INTEGER, NUMBER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const couponMasterModel = sequelize.define("coupon_masters", {
    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    coupon_code: {
        type: STRING,
    },
    coupon_discount_percentage: {
        type: NUMBER,
    },
    max_use_count: {
        type: NUMBER,
    },
    coupon_expire_date: {
        type: DATE,
    },
    plan_id: {
        type: INTEGER,
    },

    created_date_time: {
        type: DATE,
    },
    isDelete: {
        type: TINYINT,
        defaultValue: "0",
    },
    isActive: {
        type: TINYINT,
        defaultValue: "1",
    },
});

export default couponMasterModel;
