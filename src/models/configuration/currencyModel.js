import { INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const currencyModel = sequelize.define("currencies", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
    comment: "Primary key: Unique identifier for each currency",
  },
  short_name: {
    type: STRING,
    comment: "Short currency code (e.g., USD, EUR)",
  },
  name: {
    type: STRING,
    comment: "Full name of the currency (e.g., United States Dollar)",
  },
  symbol: {
    type: STRING,
    comment: "Currency symbol (e.g., $, €, £)",
  },
  today_rate: {
    type: STRING,
    comment: "Today's exchange rate relative to the base currency",
  },
  isDelete: {
    type: TINYINT,
    comment: "Soft delete flag (0 = active, 1 = deleted)",
  },
  isActive: {
    type: TINYINT,
    comment: "Active status flag (0 = inactive, 1 = active)",
  }
});

export default currencyModel;
