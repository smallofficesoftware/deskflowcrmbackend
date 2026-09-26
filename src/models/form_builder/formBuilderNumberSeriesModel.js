import { DATE, INTEGER, STRING } from "sequelize";

export const formBuilderNumberSeriesModel = (sequelize) => {
  return sequelize.define(
    "form_builder_number_series",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      form_id: {
        type: INTEGER,
      },
      field_key: {
        type: STRING(64),
      },
      series_key: {
        type: STRING(100),
        defaultValue: "",
      },
      period_key: {
        type: STRING(20),
      },
      last_number: {
        type: INTEGER,
        defaultValue: 0,
      },
      created_date_time: {
        type: DATE,
      },
      updated_date_time: {
        type: DATE,
      },
    },
    {
      timestamps: false,
    },
  );
};
