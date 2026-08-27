/**
 * Migration Name: add-socket-connection-switch-to-application-logins
 * Database Type: MASTER
 * Created: 27/08/2026
 *
 * Per-login (team member) opt-in for the CRM's socket.io real-time layer,
 * separate from the company-wide document_designer/report_builder-style
 * feature flags and from maintenance_modes.is_socket_disabled (a global
 * admin-panel kill switch). Default 0 (off) - a login only gets a live
 * connection once they explicitly turn it on from Save Personal Detail
 * (PersonalSettingView.tsx).
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("a_application_logins");
  if (!table.socket_connection_switch) {
    await queryInterface.addColumn("a_application_logins", "socket_connection_switch", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("a_application_logins", "socket_connection_switch");
};
