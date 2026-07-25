import { INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const refferralCodeMasterModal = sequelize.define("referral_code_masters", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  referral_code: {
    type: STRING,
  },
  member_name: {
    type: STRING,
  },
  member_mobile_number: {
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
  is_expairy_change: {
    type: TINYINT,
    defaultValue: "0",
  },
  is_invoice_download: {
    type: TINYINT,
    defaultValue: "0",
  },
});

export default refferralCodeMasterModal;
