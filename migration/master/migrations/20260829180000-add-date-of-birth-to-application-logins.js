/**
 * Migration Name: add-date-of-birth-to-application-logins
 * Database Type: MASTER
 * Created: 29/08/2026
 *
 * Adds date_of_birth so the HRMS Insight "Birthdays" tile (team members whose
 * birthday falls on the selected date) has real data to count against —
 * previously no field existed anywhere to store this.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("a_application_logins");
  if (!table.date_of_birth) {
    await queryInterface.addColumn("a_application_logins", "date_of_birth", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("a_application_logins", "date_of_birth");
};
