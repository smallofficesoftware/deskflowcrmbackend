import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";


export const stagestatusModel = (sequelize) => {

  return sequelize.define("stage_status_masters", {

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

    name: {
      type: STRING,
    },

    color: {
      type: STRING,
    },

    order_type: {
      type: INTEGER,
    },
    display_order_type: {
      type: INTEGER,
    },

    change_status_team_ids: {
      type: STRING,
    },

    show_status_data_team_ids: {
      type: STRING,
    },
    status_type: {
      type: TINYINT,
    },
    visibility: {
      type: TINYINT,
    },

    created_date_time: {
      type: DATE,
      defaultValue: NOW,
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

  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });

}