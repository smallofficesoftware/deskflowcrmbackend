import { DATE, INTEGER, TEXT, TIME, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const categoryModelb2b = sequelize.define("category_b2bs", {

    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },

    category_name_b2b: {
        type: TEXT,
    },
    category_img_b2b:{
        type: String,
    },
    created_date_time: {
        type: DATE,
    },

    s_timestemp: {
        type: TIME,
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
export default categoryModelb2b;