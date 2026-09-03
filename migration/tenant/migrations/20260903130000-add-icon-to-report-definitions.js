/**
 * Migration Name: add-icon-to-report-definitions
 * Database Type: TENANT
 *
 * Which named icon (frontend's reportIcons.tsx REPORT_ICON_PATHS key) this
 * report's tile shows on the Custom Reports / Saved Reports grids — was
 * hardcoded to "report" for every dynamic tile before this. NULL falls
 * back to "report" client-side, same as an unknown/removed icon name would.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.icon) {
    await queryInterface.addColumn("report_definitions", "icon", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("report_definitions", "icon");
};
