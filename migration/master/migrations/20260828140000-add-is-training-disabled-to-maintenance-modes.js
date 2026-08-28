/**
 * Migration Name: add-is-training-disabled-to-maintenance-modes
 * Database Type: MASTER
 * Created: 28/08/2026
 *
 * Admin-panel controlled on/off for the CRM "Training" button. When
 * `is_training_disabled` = 1 the training button is hidden/inactive
 * platform-wide (see src/services/application_login/loginService.js's
 * onload check). Default 0 keeps it shown, matching the "1 = restrict"
 * convention already used by is_maintenance / is_logout_strict /
 * is_socket_disabled.
 *
 * The maintenanceModesModel.js and adminpanel/backend's own MaintenanceMode
 * model both already declare this column (added alongside the admin-panel
 * training toggle feature), and it's logged in alter.txt — but no migration
 * for it existed in THIS chain (only a separate, not-deploy-wired one under
 * adminpanel/backend/src/database/migrations/), so it was never actually
 * applied to any real DB: every SELECT against maintenance_modes started
 * throwing "Unknown column 'is_training_disabled'" the moment that code
 * shipped. This migration is the fix — mirrors
 * 20260827120000-add-is-socket-disabled-to-maintenance-modes.js exactly.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("maintenance_modes");
  if (!table.is_training_disabled) {
    await queryInterface.addColumn("maintenance_modes", "is_training_disabled", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("maintenance_modes", "is_training_disabled");
};
