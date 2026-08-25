/**
 * Migration Name: create-task-checklist-items
 * Database Type: TENANT
 *
 * Lightweight checklist ("subtask") items nested under a parent task —
 * title + done/not-done + order only, no assignee/dates/priority/status of
 * their own. Same shape/conventions as task_message_histories (comments):
 * own isDelete/isActive, plain task_id FK.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("task_checklist_items", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    task_id: {
      type: Sequelize.INTEGER,
    },
    title: {
      type: Sequelize.STRING,
    },
    is_done: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    position: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
    },
    completed_date: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    completed_by: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    created_date_time: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    modified_date: {
      type: Sequelize.DATE,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    isActive: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
  });

  await queryInterface.addIndex("task_checklist_items", {
    fields: ["task_id"],
    name: "idx_task_checklist_items_task_id",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("task_checklist_items");
};
