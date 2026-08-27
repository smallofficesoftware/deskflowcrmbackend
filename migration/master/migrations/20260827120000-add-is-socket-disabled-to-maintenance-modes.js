/**
 * Migration Name: add-is-socket-disabled-to-maintenance-modes
 * Database Type: MASTER
 * Created: 27/08/2026
 *
 * Admin-panel controlled kill-switch for the CRM websocket layer. When
 * `is_socket_disabled` = 1 the backend rejects new socket.io connections
 * (see src/index.js io.use gate). Default 0 keeps sockets on, matching the
 * "1 = restrict" convention already used by is_maintenance / is_logout_strict.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("maintenance_modes");
  if (!table.is_socket_disabled) {
    await queryInterface.addColumn("maintenance_modes", "is_socket_disabled", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("maintenance_modes", "is_socket_disabled");
};
