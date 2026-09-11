/**
 * Migration Name: restore-compulsory-attendance-flags-on-employee-payrolls
 * Database Type: TENANT
 *
 * Reverts 20260911140000-drop-compulsory-attendance-flags-from-employee-
 * payrolls.js: compulsary_attendance/compulsary_attendance_image move back
 * onto employee_payrolls, and "GPS Compulsory for App Use"
 * (compulsary_gps_app_use) joins them here too, instead of on
 * a_application_logins. Single source of truth for all three: the web
 * "Edit Team Member" screen's Attendance & Salary tab (create/update-emp-
 * payroll) already naturally writes here, the Flutter "Edit Team" screen
 * is updated to write here too (fetch/create/update-emp-payroll), and
 * onLoad (loginService.js) reads from here.
 */

export const up = async (queryInterface, Sequelize) => {
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
      after: "compulsary_attendance",
    });
  }
  if (!table.compulsary_gps_app_use) {
    await queryInterface.addColumn("employee_payrolls", "compulsary_gps_app_use", {
      type: Sequelize.TINYINT,
      allowNull: true,
      defaultValue: 0,
      after: "compulsary_attendance_image",
    });
  }
};

export const down = async (queryInterface) => {
  const table = await queryInterface.describeTable("employee_payrolls");
  if (table.compulsary_gps_app_use) {
    await queryInterface.removeColumn("employee_payrolls", "compulsary_gps_app_use");
  }
  if (table.compulsary_attendance_image) {
    await queryInterface.removeColumn("employee_payrolls", "compulsary_attendance_image");
  }
  if (table.compulsary_attendance) {
    await queryInterface.removeColumn("employee_payrolls", "compulsary_attendance");
  }
};
