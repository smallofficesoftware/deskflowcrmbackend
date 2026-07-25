import { DATE, FLOAT, INTEGER, SMALLINT, STRING, TEXT, TIME, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const loginModel = sequelize.define("a_application_logins", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  employee_id: {
    type: STRING,
  },
  username: {
    type: STRING,
  },
  password: {
    type: STRING,
  },
  recovery_email: {
    type: STRING,
  },
  recovery_mobile: {
    type: STRING,
  },
  created_date_time: {
    type: DATE,
  },
  gender: {
    type: SMALLINT,
  },
  whatsapp_appkey: {
    type: TEXT
  },
  whatsapp_authkey: {
    type: TEXT
  },
  profile_pic: {
    type: STRING,
  },
  s_timestemp: {
    type: INTEGER,
  },
  session_token: {
    type: STRING
  },
  host_out_going_mail: {
    type: STRING
  },
  port_mail_setup: {
    type: INTEGER
  },
  mail_id_setup: {
    type: STRING
  },
  password_mail_setup: {
    type: STRING
  },
  pop3_host: {
    type: STRING
  },
  incoming_port: {
    type: INTEGER
  },
  login_pin: {
    type: STRING
  },
  otp: {
    type: INTEGER
  },
  web_refresh_token: {
    type: TEXT
  },
  android_refresh_token: {
    type: TEXT
  },
  ios_refresh_token: {
    type: TEXT
  },
  web_device_token: {
    type: TEXT
  },
  android_device_token: {
    type: TEXT
  },
  ios_device_token: {
    type: TEXT
  },
  web_last_login: {
    type: DATE
  },
  android_last_login: {
    type: DATE
  },
  ios_last_login: {
    type: DATE
  },
  team_member_join: {
    type: INTEGER
  },
  team_member_attendance: {
    type: INTEGER
  },
  team_expense_entry: {
    type: INTEGER
  },
  team_visit_entry: {
    type: INTEGER
  },
  order_approve: {
    type: INTEGER
  },
  payment_approve: {
    type: INTEGER
  },
  inquiry_status: {
    type: INTEGER
  },
  inquiry_assignment: {
    type: INTEGER
  },
  reminder_alert: {
    type: INTEGER
  },
  compulsary_attendance: {
    type: TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: "1=>yes,0=>no",
  },
  compulsary_attendance_image: {
    type: TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: "1=>yes,0=>no",
  },
  daily_in_time: {
    type: TIME,
  },
  daily_out_time: {
    type: TIME,
  },
  daily_working_hours: {
    type: STRING
  },
  daily_break_hours: {
    type: STRING
  },
  min_present_hours: {
    type: STRING
  },
  per_hour_salary: {
    type: FLOAT
  },
  reporting_member: {
    type: INTEGER,
  },
  department: {
    type: INTEGER,

  },
  registration_flag: {
    type: STRING
  },
  expense_types: {
    type: STRING
  },
  // 1=>Verified,2=>notVerified
  isOtpVerified: {
    type: TINYINT
  },
  // 1=>Verified
  is_email_verified: {
    type: TINYINT
  },
  salary_type: {
    type: TINYINT
  },
  salary_amount_type_wise: {
    type: FLOAT
  },
  week_off_days: {
    type: STRING
  },
  location_switch: {
    type: TINYINT
  },
  activitylocationswitch: {
    type: TINYINT
  },
  callHistoryswitch: {
    type: TINYINT
  },
  callhistory_lastdate: {
    type: TEXT
  },
  callPopupSwitch: {
    type: TEXT
  },
  whatsapp_phone_number_id: {
    type: TEXT
  },
  whatsapp_waba_id: {
    type: STRING(100)
  },
  whatsapp_connection_id: {
    type: TEXT
  },
  whatsapp_api_key: {
    type: TEXT
  },
  aadhar_card_number: {
    type: STRING,
  },
  pan_card_number: {
    type: STRING,
  },
  employee_pf_no: {
    type: STRING,
  },
  date_of_joining: {
    type: DATE
  },
  isDelete: {
    type: TINYINT,
    defaultValue: '0'
  },
  isActive: {
    type: TINYINT,
    defaultValue: '1'
  }
});

export default loginModel;

