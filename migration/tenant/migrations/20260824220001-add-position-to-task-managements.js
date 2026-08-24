/**
 * Migration Name: add-position-to-task-managements
 * Database Type: TENANT
 *
 * Adds a drag-order column for the task Kanban boards (task list board and
 * contact-linked task board, both share this table), scoped within each
 * status column. NULL sorts last (row was never dragged) — see backfill
 * UPDATE in alter.txt.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("task_managements", "position", {
    type: Sequelize.INTEGER,
    allowNull: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("task_managements", "position");
};
