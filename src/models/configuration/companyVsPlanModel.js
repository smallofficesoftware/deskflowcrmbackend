import { DATE, INTEGER, NUMBER, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const companyVsPlansModel = sequelize.define("company_vs_plans",
  {
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
    razorpay_payment_id: {
      type: TEXT,
    },
    razorpay_order_id: {
      type: TEXT,
    },
    razorpay_signature: {
      type: TEXT
    },
    amount: {
      type: INTEGER
    },
    plan_id: {
      type: INTEGER
    },
    coupon_code_id: {
      type: INTEGER
    },
    plan_name: {
      type: STRING
    },
    plan_amount: {
      type: NUMBER
    },
    discount_amount: {
      type: NUMBER
    },
    gst_amount: {
      type: NUMBER
    },
    plan_duration: {
      type: NUMBER
    },
    sr_by_number: {
      type: NUMBER
    },
    invoice_number: {
      type: STRING
    },
    round_off_amount: {
      type: NUMBER
    },
    invoice_created_date_time: {
      type: DATE
    },
    created_date_time: {
      type: DATE,
    },
    s_timestemp: {
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
  });

export default companyVsPlansModel;
