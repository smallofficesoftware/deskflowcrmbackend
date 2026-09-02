/**
 * Migration Name: add-index-reminder-messages-login-flag-status
 * Database Type: TENANT
 * Created: 01/09/2026
 *
 * slow.log analysis (querylog/index_report_condensed.txt): reminder list
 * queries filter on a_application_login_id + is_reminder_app_flag + status
 * together, uncovered by existing keys (assigned_to, reminder_data_time,
 * isDelete) — 1564 hits, 1.86s total.
 */

export const up = async (queryInterface) => {
  const indexes = await queryInterface.showIndex("reminder_messages");
  if (!indexes.some((i) => i.name === "idx_reminder_messages_login_flag_status")) {
    await queryInterface.addIndex("reminder_messages", {
      fields: ["a_application_login_id", "is_reminder_app_flag", "status"],
      name: "idx_reminder_messages_login_flag_status",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeIndex("reminder_messages", "idx_reminder_messages_login_flag_status");
};
