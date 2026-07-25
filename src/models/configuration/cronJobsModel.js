import { DATE, INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const cronJobsModel = sequelize.define("cron_jobs", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  cron_title: {
    type: STRING,
    unique: true,
  },
  crone_tab_start_stop_flag: {
    type: TINYINT,
  },
  cron_time: {
    type: STRING,
  },
  cron_start_time: {
    type: DATE,
  },
  cron_stop_time: {
    type: DATE,
  },
  created_date_time: {
    type: DATE,
  }
});

export default cronJobsModel;
