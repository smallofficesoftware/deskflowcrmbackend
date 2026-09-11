/**
 * Migration Name: add-gps-compulsory-to-application-logins
 * Database Type: MASTER
 * Created: 11/09/2026
 *
 * "GPS Compulsory for App Use" — a per-team-member yes/no toggle, same
 * shape as the existing compulsary_attendance_image column right next to
 * it, and on the same table: a_application_logins is what the Team edit
 * screen (EditTeamController.dart's commonUpdate call) actually writes to.
 * Read by onLoad (loginService.js) and returned to the mobile app
 * alongside compulsary_attendance/compulsary_attendance_image.
 */

export const up = async (queryInterface, Sequelize) => {
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

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("a_application_logins", "compulsary_gps_app_use");
};
