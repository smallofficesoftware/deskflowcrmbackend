/**
 * Migration Name: create-report-schedules
 * Database Type: TENANT
 *
 * Step 8a — scheduled delivery of a report_definition on a recurring
 * cadence. Dispatched by an external cron hitting
 * reportScheduleDispatchCroneTabRunner (reportScheduleServices.js) —
 * this table only stores the schedule itself, the dispatcher does the
 * actual running/generating/emailing.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("report_schedules", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    report_definition_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      comment: "Creator — the report runs with THEIR data scope, not each recipient's own",
    },
    frequency: {
      type: Sequelize.ENUM("daily", "weekly", "monthly"),
      allowNull: false,
    },
    send_time: {
      type: Sequelize.STRING,
      allowNull: false,
      comment: "HH:mm, 24-hour, tenant's own local convention (no timezone stored — same as every other plain time field in this schema)",
    },
    // weekly: 0(Sun)-6(Sat); monthly: 1-28 (capped, to stay valid every month)
    day_of_week: {
      type: Sequelize.TINYINT,
      allowNull: true,
    },
    day_of_month: {
      type: Sequelize.TINYINT,
      allowNull: true,
    },
    delivery_format: {
      type: Sequelize.ENUM("excel", "pdf", "both"),
      allowNull: false,
      defaultValue: "excel",
    },
    // {"logins":[number,...], "emails":["a@b.com",...]} — mixes internal
    // team members and raw external addresses in one delivery.
    recipients: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    next_run_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    last_run_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    isActive: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
  });

  await queryInterface.addIndex("report_schedules", {
    fields: ["next_run_at", "isActive", "isDelete"],
    name: "idx_report_schedules_due",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("report_schedules");
};
