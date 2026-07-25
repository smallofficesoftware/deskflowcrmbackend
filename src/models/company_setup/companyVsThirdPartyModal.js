import { DATE, INTEGER, NOW, NUMBER, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const companyVsThirdPartyModal = sequelize.define("company_masters_vs_third_party_integrations", {
    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    company_id: {
        type: INTEGER,
    },
    host_out_going_mail: {
        type: STRING,
    },
    port_mail_setup: {
        type: NUMBER,
    },
    mail_id_setup: {
        type: STRING,
    },
    password_mail_setup: {
        type: STRING,
    },
    pop3_host: {
        type: STRING,
    },
    incoming_port: {
        type: INTEGER,
    },
    trade_india_user_id: {
        type: STRING,
    },
    trade_india_profile_id: {
        type: STRING,
    },
    trade_india_key: {
        type: TEXT,
    },
    india_mart_api_key: {
        type: TEXT,
    },
    whatsapp_authkey: {
        type: TEXT,
    },
    whatsapp_appkey: {
        type: TEXT,
    },
    chatgpt_appkey: {
        type: TEXT,
    },
    gimini_appkey: {
        type: TEXT,
    },
    google_lead_sheet_for_faceBook_1: {
        type: TEXT,
    },
    google_lead_sheet_for_faceBook_2: {
        type: TEXT,
    },
    google_sheet_key_3: {
        type: TEXT,
    },
    google_sheet_key_4: {
        type: TEXT,
    },
    google_sheet_first_name: {
        type: TEXT,
    },
    google_sheet_second_name: {
        type: TEXT,
    },
    google_sheet_third_name: {
        type: TEXT,
    },
    google_sheet_fourth_name: {
        type: TEXT,
    },
    serp_api_key: {
        type: STRING,
    },
    s_timestemp: {
        type: DATE,
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
});

export default companyVsThirdPartyModal;