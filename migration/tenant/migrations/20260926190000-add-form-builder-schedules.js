/**
 * Migration Name: add-form-builder-schedules
 * Database Type: TENANT
 *
 * Form Builder recurring forms (plan item Q1/Q2): "fill this form every day /
 * on these weekdays / on this day of the month", per person.
 *
 *  - form_builder_schedules: the rule (how often, who, from/to which date).
 *  - form_builder_schedule_entries: one row per person per due day, created
 *    when someone opens "Forms due today" (catches up any days missed); the
 *    submission is linked when the person fills the form. A due day with no
 *    submission after the day has passed is a "missed" entry.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("form_builder_schedules", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    form_id: { type: Sequelize.INTEGER, allowNull: false },
    title: { type: Sequelize.STRING(150), allowNull: false },
    frequency: { type: Sequelize.STRING(10), allowNull: false }, // daily | weekly | monthly
    weekdays: { type: Sequelize.STRING(20), allowNull: true }, // "1,3,5" (0 = Sunday), weekly only
    day_of_month: { type: Sequelize.TINYINT, allowNull: true }, // monthly only
    assignee_login_ids: { type: Sequelize.TEXT, allowNull: false }, // JSON list of a_application_login ids
    start_date: { type: Sequelize.DATEONLY, allowNull: false },
    end_date: { type: Sequelize.DATEONLY, allowNull: true },
    last_generated_date: { type: Sequelize.DATEONLY, allowNull: true },
    created_by_a_application_login_id: { type: Sequelize.INTEGER, allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false },
    isDelete: { type: Sequelize.TINYINT, defaultValue: 0 },
    isActive: { type: Sequelize.TINYINT, defaultValue: 1 },
  });
  await queryInterface.addIndex("form_builder_schedules", { fields: ["form_id", "isDelete"], name: "idx_form_builder_schedules_form" });

  await queryInterface.createTable("form_builder_schedule_entries", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    schedule_id: { type: Sequelize.INTEGER, allowNull: false },
    form_id: { type: Sequelize.INTEGER, allowNull: false },
    due_date: { type: Sequelize.DATEONLY, allowNull: false },
    a_application_login_id: { type: Sequelize.INTEGER, allowNull: false },
    submission_id: { type: Sequelize.INTEGER, allowNull: true },
    filled_at: { type: Sequelize.DATE, allowNull: true },
  });
  await queryInterface.addIndex("form_builder_schedule_entries", {
    fields: ["schedule_id", "due_date", "a_application_login_id"],
    unique: true,
    name: "uq_form_builder_schedule_entry",
  });
  await queryInterface.addIndex("form_builder_schedule_entries", {
    fields: ["a_application_login_id", "due_date"],
    name: "idx_form_builder_schedule_entry_user",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("form_builder_schedule_entries");
  await queryInterface.dropTable("form_builder_schedules");
};
