import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const callhistoryModel = (sequelize) => {

  return sequelize.define("call_histories", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    //   1 => Quotation/Estimate ,2 => Order ,3 => Invoice 4=>Purchase
    call_type: {
      type: INTEGER,
    },
    call_date_time: {
      type: DATE,
    },
    duration: {
      type: STRING,
    },
    mobile_number: {
      type: STRING,
    },
    contact_id: {
      type: INTEGER,
    },

    a_application_login_id: {
      type: INTEGER,
    },
    company_masters_id: {
      type: INTEGER,
    },
    call_name: {
      type: STRING,
    },
    file_name: {
      type: STRING,
    },
    file_duration: {
      type: INTEGER,
    },
    file_path: {
      type: TEXT,
    },
    remark: {
      type: TEXT,
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },

    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
    created_date_time: {
      type: DATE,
    },
    s_timestemp: {
      type: DATE
    }
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });

}