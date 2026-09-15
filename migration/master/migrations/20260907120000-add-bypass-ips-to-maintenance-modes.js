/**
 * Migration Name: add-bypass-ips-to-maintenance-modes
 * Database Type: MASTER
 * Created: 07/09/2026
 *
 * Admin-panel controlled maintenance bypass list. `bypass_ips` holds a
 * comma-separated list of client IPs (IPv4 and/or IPv6) that skip the
 * maintenance / strict-logout gate in src/middlewares/maintenanceMode.js.
 * Replaces the old env-var-only MAINTENANCE_BYPASS_IPS so the list can be
 * edited from the admin panel Maintenance page without a redeploy.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("maintenance_modes");
  if (!table.bypass_ips) {
    await queryInterface.addColumn("maintenance_modes", "bypass_ips", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("maintenance_modes", "bypass_ips");
};
