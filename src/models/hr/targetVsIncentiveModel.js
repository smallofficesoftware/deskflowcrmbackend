import { DATE, DATEONLY, DOUBLE, INTEGER, NOW, TINYINT } from "sequelize";
export const targetVsIncentiveModel = (sequelize) => {
  return sequelize.define("target_vs_incentives", {
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
    assigned_team_member: {
      type: INTEGER,
    },
    target_flag: {
      type: TINYINT,
      defaultValue: "0",
    },
    product_id: {
      type: INTEGER,
    },
    target_todate: {
      type: DATEONLY,
    },
    target_fromdate: {
      type: DATEONLY,
    },
    target_type: {
      type: TINYINT,
      defaultValue: "0",
    },
    target_count: {
      type: INTEGER,
    },
    target_value: {
      type: DOUBLE,
    },
    incentive_type: {
      type: TINYINT,
      defaultValue: "0",
    },
    incentive_value: {
      type: DOUBLE,
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
};
