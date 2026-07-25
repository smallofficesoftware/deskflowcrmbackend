/**
 * Migration Name: add-comments-in-socket-connections
 * Database Type: MASTER
 * Created: 25/10/2025 12:54:52 PM
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("socket_connections", "id", {
    type: Sequelize.INTEGER(11),
    comment: "Primary key: Unique identifier for each socket connection",
  });
  await queryInterface.changeColumn(
    "socket_connections",
    "a_application_logins_id",
    {
      type: Sequelize.INTEGER(11),
      allowNull: false,
      comment: "Foreign key: References 'a_application_logins' table, linking this socket to a specific user login user",
    }
  );
  await queryInterface.changeColumn("socket_connections", "company_masters_id", {
    type: Sequelize.INTEGER(11),
    allowNull: false,
    comment: "Foreign key: References 'company_masters' table, indicating which company this socket belongs to",
  });
  await queryInterface.changeColumn("socket_connections", "socket_id", {
    type: Sequelize.STRING(255),
    allowNull: false,
    comment: "Unique socket identifier for the user's active WebSocket connection",
  });
  await queryInterface.changeColumn("socket_connections", "updated_date", {
    type: Sequelize.DATE,
    allowNull: false,
    comment: "Date and time when this socket connection record was last updated",
  });
}

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("socket_connections", "id", {
    type: Sequelize.INTEGER(11),
    comment: null,
  });
  await queryInterface.changeColumn("socket_connections", "a_application_logins_id", {
    type: Sequelize.INTEGER(11),
    allowNull: false,
    comment: null,
  });
  await queryInterface.changeColumn("socket_connections", "company_masters_id", {
    type: Sequelize.INTEGER(11),
    allowNull: false,
    comment: null,
  });
  await queryInterface.changeColumn("socket_connections", "socket_id", {
    type: Sequelize.STRING(255),
    allowNull: false,
    comment: null,
  });
  await queryInterface.changeColumn("socket_connections", "updated_date", {
    type: Sequelize.DATE,
    allowNull: false,
    comment: null,
  });
}
