/**
 * Migration Name: create-form-builder-number-series
 * Database Type: TENANT
 *
 * Running counter for Form Builder "auto-number" fields (plan item B).
 * One row per form + field + series (e.g. per Division, "" when the
 * field has a single series) + period (the reset bucket: "all", a
 * financial year like "2026-2027", a year, or a year-month). The next
 * number is taken by locking this row (SELECT ... FOR UPDATE) inside the
 * same transaction as the submission insert.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_number_series", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    form_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    field_key: {
      type: Sequelize.STRING(64),
      allowNull: false,
    },
    series_key: {
      type: Sequelize.STRING(100),
      allowNull: false,
      defaultValue: "",
    },
    period_key: {
      type: Sequelize.STRING(20),
      allowNull: false,
    },
    last_number: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    updated_date_time: {
      type: Sequelize.DATE,
      allowNull: true,
    },
  });

  await queryInterface.addIndex("form_builder_number_series", {
    fields: ["form_id", "field_key", "series_key", "period_key"],
    unique: true,
    name: "uniq_form_builder_number_series",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_number_series");
};
