import { DATE, INTEGER, TEXT, TIME, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const subCategoryModelb2b = sequelize.define("sub_category_b2bs", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  sub_category_name_b2b: {
    type: TEXT,
  },

  category_id_b2b: {
    type: INTEGER,
  },

  subcategory_img_b2b:{
     type:String,
  },

  created_date_time: {
    type: DATE,
  },

  s_timestemp: {
    type: TIME,
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
export default subCategoryModelb2b;