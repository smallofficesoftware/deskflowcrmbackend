import { INTEGER, STRING, TINYINT } from "sequelize";

export const countryModel = (sequelize) => {
  return sequelize.define("a_countries", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
      comment: "Primary key: Unique identifier for each country",
    },
    country_name: {
      type: STRING,
      comment: "Full name of the country (e.g., United States)",
    },
    country_iso: {
      type: STRING,
      comment: "ISO 2/3 country code (e.g., US, USA)",
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
      comment: "Soft delete flag (0 = active, 1 = deleted)",
    },
    isActive: {
      type: TINYINT,
      defaultValue: "1",
      comment: "Active status flag (0 = inactive, 1 = active)",
    },
    country_code: {
      type: STRING,
      comment: "Country dialing code (e.g., +1, +91)",
    }
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
}
