import { DataTypes, DATE, DATEONLY, DOUBLE, INTEGER, STRING, TEXT, TIME, TINYINT } from "sequelize";
export const taskManagementModel = (sequelize) => {
  return sequelize.define("task_managements", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    task_title: {
      type: DataTypes.STRING,
    },
    task_category_id: {
      type: INTEGER,
    },
    task_priority: {
      type: INTEGER,
    },
    team_task_assignement_type: {
      type: TINYINT,
    },
    task_type: {
      type: INTEGER,
    },
    task_selected_date: {
      type: DATE,
    },
    selected_task_days: {
      type: TEXT,
    },
    assigned_team_member: {
      type: TEXT,
    },
    task_fromdate: {
      type: DATE,
    },
    task_enddate: {
      type: DATE,
    },
    task_remark: {
      type: TEXT,
    },
    task_template: {
      type: TINYINT,
    },
    status: {
      type: TINYINT,
      defaultValue: "0",
    },
    external_status: {
      type: TINYINT,
      defaultValue: "0",
    },
    is_archive: {
      type: TINYINT,
      defaultValue: "0",
    },
    is_notification_sand_wp: {
      type: TINYINT,
      defaultValue: "0",
    },
    is_notification_sand_email: {
      type: TINYINT,
      defaultValue: "0",
    },
    is_not_visible: {
      type: TINYINT,
      defaultValue: "0",
    },
    task_template_data_source_id: {
      type: INTEGER,
      defaultValue: "0",
    },
    task_template_data_id: {
      type: INTEGER,
      defaultValue: "0",
    },
    grouped_task_unque_key: {
      type: TEXT,
      defaultValue: "0",
    },
    template_seq_no: {
      type: INTEGER,
      defaultValue: "0",
    },
    is_support_ticket: {
      type: TINYINT,
      defaultValue: "0",
    },

    reference_table: {
      type: STRING,
    },
    label_id: {
      type: STRING,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    is_unread: {
      type: TINYINT,
    },
    is_read_by_a_application_login_id: {
      type: STRING,
    },
    contact_masters_id: {
      type: INTEGER,
    },
    reference_id: {
      type: INTEGER,
    },

    company_masters_id: {
      type: INTEGER,
    },
    completed_date: {
      type: DATE,
    },
    complated_by: {
      type: INTEGER,
    },
    modify_date: {
      type: DATE,
    },
    modify_by: {
      type: INTEGER,
    },

    created_date_time: {
      type: STRING,
    },
    task_attechment: {
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
    is_auto_create: {
      type: TINYINT,
      defaultValue: "0",
    },
    customer_company_id: {
      type: INTEGER,
    },
    customer_application_login_id: {
      type: INTEGER,
    },
    task_column_number_1: {
      type: INTEGER,
    },
    task_column_number_2: {
      type: INTEGER,
    },
    task_column_number_3: {
      type: INTEGER,
    },
    task_column_number_4: {
      type: INTEGER,
    },
    task_column_number_5: {
      type: INTEGER,
    },
    task_column_text_1: {
      type: STRING,
    },
    task_column_text_2: {
      type: STRING,
    },
    task_column_text_3: {
      type: STRING,
    },
    task_column_text_4: {
      type: STRING,
    },
    task_column_text_5: {
      type: STRING,
    },
    task_column_text_area_1: {
      type: TEXT,
    },
    task_column_text_area_2: {
      type: TEXT,
    },
    task_column_text_area_3: {
      type: TEXT,
    },
    task_column_text_area_4: {
      type: TEXT,
    },
    task_column_text_area_5: {
      type: TEXT,
    },
    task_column_date_1: {
      type: DATEONLY,
    },
    task_column_date_2: {
      type: DATEONLY,
    },
    task_column_date_3: {
      type: DATEONLY,
    },
    task_column_date_4: {
      type: DATEONLY,
    },
    task_column_date_5: {
      type: DATEONLY,
    },
    task_column_date_and_time_1: {
      type: DATE,
    },
    task_column_date_and_time_2: {
      type: DATE,
    },
    task_column_date_and_time_3: {
      type: DATE,
    },
    task_column_date_and_time_4: {
      type: DATE,
    },
    task_column_date_and_time_5: {
      type: DATE,
    },
    task_column_time_1: {
      type: TIME,
    },
    task_column_time_2: {
      type: TIME,
    },
    task_column_time_3: {
      type: TIME,
    },
    task_column_time_4: {
      type: TIME,
    },
    task_column_time_5: {
      type: TIME,
    },
    task_column_switch_1: {
      type: TINYINT,
    },
    task_column_switch_2: {
      type: TINYINT,
    },
    task_column_switch_3: {
      type: TINYINT,
    },
    task_column_switch_4: {
      type: TINYINT,
    },
    task_column_switch_5: {
      type: TINYINT,
    },
    task_column_decimal_1: {
      type: DOUBLE,
    },
    task_column_decimal_2: {
      type: DOUBLE,
    },
    task_column_decimal_3: {
      type: DOUBLE,
    },
    task_column_decimal_4: {
      type: DOUBLE,
    },
    task_column_decimal_5: {
      type: DOUBLE,
    },
    task_column_dropdown_1: {
      type: STRING,
    },
    task_column_dropdown_2: {
      type: STRING,
    },
    task_column_dropdown_3: {
      type: STRING,
    },
    task_column_dropdown_4: {
      type: STRING,
    },
    task_column_dropdown_5: {
      type: STRING,
    },
    task_column_radio_1: {
      type: STRING,
    },
    task_column_radio_2: {
      type: STRING,
    },
    task_column_radio_3: {
      type: STRING,
    },
    task_column_radio_4: {
      type: STRING,
    },
    task_column_radio_5: {
      type: STRING,
    },
    task_column_attechments_1: {
      type: TEXT,
    },
    task_column_attechments_2: {
      type: TEXT,
    },
    task_column_attechments_3: {
      type: TEXT,
    },
    task_column_attechments_4: {
      type: TEXT,
    },
    task_column_attechments_5: {
      type: TEXT,
    },

  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
};
