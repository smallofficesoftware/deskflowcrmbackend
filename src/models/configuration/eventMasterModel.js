import { DATE, DATEONLY, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

// Read-only from this side — adminpanel (deskflowadminpanel repo) owns
// create/update/delete for this table. Lives on the shared master
// (smalloffice) DB, same connection maintenanceModesModel.js uses (see
// alter.txt: "Tables live on the shared master (smalloffice) DB that
// adminpanel/backend uses"). Used here only to surface the next upcoming
// event's date/title on the CRM's own "Scheduled Training" button.
const eventMasterModel = sequelize.define(
  "event_masters",
  {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    event_type_id: {
      type: INTEGER,
    },
    event_title: {
      type: STRING,
    },
    event_date: {
      type: DATEONLY,
    },
    start_time: {
      type: STRING,
    },
    end_time: {
      type: STRING,
    },
    remarks: {
      type: TEXT,
    },
    status_id: {
      type: INTEGER,
    },
    is_participation_allowed: {
      type: TINYINT,
      defaultValue: 0,
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
  },
  {
    timestamps: false,
  }
);

export default eventMasterModel;
