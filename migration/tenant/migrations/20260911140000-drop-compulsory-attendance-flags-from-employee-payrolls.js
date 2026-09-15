/**
 * Migration Name: drop-compulsory-attendance-flags-from-employee-payrolls
 * Database Type: TENANT
 *
 * compulsary_attendance / compulsary_attendance_image were duplicated on
 * two tables: a_application_logins (master DB, loginModel.js) and this one.
 * The Team edit screen (EditTeamController.dart's commonUpdate call) only
 * ever wrote the a_application_logins copy; onLoad (loginService.js) read
 * this table's copy instead — two unsynced sources for the same setting,
 * so an edit in the Team screen never actually changed what onLoad
 * reported. Consolidating onto a_application_logins (the one real UI
 * writes to) rather than keeping both in sync going forward — see the
 * matching master migration
 * 20260911140000-add-gps-compulsory-to-application-logins.js, which adds
 * the new "GPS Compulsory for App Use" field there instead of here.
 */

export const up = async (queryInterface) => {
  const table = await queryInterface.describeTable("employee_payrolls");
  if (table.compulsary_attendance) {
    await queryInterface.removeColumn("employee_payrolls", "compulsary_attendance");
  }
  if (table.compulsary_attendance_image) {
    await queryInterface.removeColumn("employee_payrolls", "compulsary_attendance_image");
  }
};

export const down = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("employee_payrolls");
  if (!table.compulsary_attendance) {
    await queryInterface.addColumn("employee_payrolls", "compulsary_attendance", {
      type: Sequelize.TINYINT,
      allowNull: true,
      defaultValue: 0,
    });
  }
  if (!table.compulsary_attendance_image) {
    await queryInterface.addColumn("employee_payrolls", "compulsary_attendance_image", {
      type: Sequelize.TINYINT,
      allowNull: true,
      defaultValue: 0,
    });
  }
};
