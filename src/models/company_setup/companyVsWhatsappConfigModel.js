import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const companyVsWhatsappConfigModel = sequelize.define("company_vs_whatsapp_configs", {
    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    company_id: {
        type: INTEGER,
    },
    plateform: {
        type: TINYINT,
    },
    configured_type: {
        type: TINYINT,
    },
    whatsapp_phone_number_id: {
        type: TEXT,
    },
    whatsapp_waba_id: {
        type: STRING(100),
    },
    whatsapp_connection_id: {
        type: TEXT,
    },
    whatsapp_api_key: {
        type: TEXT,
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

export default companyVsWhatsappConfigModel;