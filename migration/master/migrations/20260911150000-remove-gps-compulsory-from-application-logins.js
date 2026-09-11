/**
 * Migration Name: remove-gps-compulsory-from-application-logins
 * Database Type: MASTER
 * Created: 11/09/2026
 *
 * Reverts 20260911140000-add-gps-compulsory-to-application-logins.js:
 * compulsary_gps_app_use moves to employee_payrolls instead (tenant
 * migration 20260911150000-restore-compulsory-attendance-flags-on-
 * employee-payrolls.js), alongside compulsary_attendance/
 * compulsary_attendance_image — single source of truth for all three,
 * matching how the web "Edit Team Member" screen's Attendance & Salary
 * tab already works.
 */

export const up = async (queryInterface) => {
  const table = await queryInterface.describeTable("a_application_logins");
  if (table.compulsary_gps_app_use) {
    await queryInterface.removeColumn("a_application_logins", "compulsary_gps_app_use");
  }
};

export const down = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("a_application_logins");
  if (!table.compulsary_gps_app_use) {
    await queryInterface.addColumn("a_application_logins", "compulsary_gps_app_use", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: "1=>yes,0=>no",
      after: "compulsary_attendance_image",
    });
  }
};
