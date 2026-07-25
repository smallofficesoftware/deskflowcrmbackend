import { DATE, INTEGER, NOW, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const whatappDispatchJobs = sequelize.define("whatsapp_dispatch_jobs", {
    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    type: {
        type: TINYINT,
    },
    company_id: {
        type: INTEGER,
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

export default whatappDispatchJobs;