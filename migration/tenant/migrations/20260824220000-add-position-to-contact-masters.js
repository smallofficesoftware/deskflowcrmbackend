/**
 * Migration Name: add-position-to-contact-masters
 * Database Type: TENANT
 *
 * Adds a drag-order column for the contact pipeline Kanban board, scoped
 * within each contact_status column. NULL sorts last (row was never
 * dragged) — see backfill UPDATE in alter.txt.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("contact_masters", "position", {
    type: Sequelize.INTEGER,
    allowNull: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("contact_masters", "position");
};
