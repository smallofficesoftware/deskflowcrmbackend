import { INTEGER, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const systemDocumentTemplateModel = sequelize.define("system_document_templates", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  doc_type: {
    type: STRING,
  },
  template_name: {
    type: STRING,
  },
  description: {
    type: STRING,
  },
  template_json: {
    type: TEXT("long"),
  },
  display_order: {
    type: INTEGER,
    defaultValue: 0,
  },
  isDelete: {
    type: TINYINT,
    defaultValue: 0,
  },
  isActive: {
    type: TINYINT,
    defaultValue: 1,
  },
}, {
  timestamps: false,
});

export default systemDocumentTemplateModel;
