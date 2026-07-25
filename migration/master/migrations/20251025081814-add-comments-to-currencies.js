/**
 * Migration Name: add-comments-to-currencies
 * Database Type: MASTER
 * Created: 25/10/2025 01:48:14 PM
 */

export const up = async (queryInterface, Sequelize) => {
   await queryInterface.changeColumn("currencies", "id", {
    type: Sequelize.INTEGER,
    comment: "Primary key: Unique identifier for each currency",
  });
  await queryInterface.changeColumn("currencies", "short_name", {
    type: Sequelize.STRING,
    comment: "Short currency code (e.g., USD, EUR)",
  });
  await queryInterface.changeColumn("currencies", "name", {
    type: Sequelize.STRING,
    comment: "Full name of the currency (e.g., United States Dollar)",
  });
  await queryInterface.changeColumn("currencies", "symbol", {
    type: Sequelize.STRING,
    comment: "Currency symbol (e.g., $, €, £)",
  });
  await queryInterface.changeColumn("currencies", "today_rate", {
    type: Sequelize.STRING,
    comment: "Today's exchange rate relative to the base currency",
  });
  await queryInterface.changeColumn("currencies", "isDelete", {
    type: Sequelize.TINYINT,
    comment: "Soft delete flag (0 = active, 1 = deleted)",
  });
  await queryInterface.changeColumn("currencies", "isActive", {
    type: Sequelize.TINYINT,
    comment: "Active status flag (0 = inactive, 1 = active)",
  });
}

export const down = async (queryInterface, Sequelize) => {
   await queryInterface.changeColumn("currencies", "id", {
    type: Sequelize.INTEGER,
    comment: null,
  });
  await queryInterface.changeColumn("currencies", "short_name", {
    type: Sequelize.STRING,
    comment: null,
  });
  await queryInterface.changeColumn("currencies", "name", {
    type: Sequelize.STRING,
    comment: null,
  });
  await queryInterface.changeColumn("currencies", "symbol", {
    type: Sequelize.STRING,
    comment: null,
  });
  await queryInterface.changeColumn("currencies", "today_rate", {
    type: Sequelize.STRING,
    comment: null,
  });
  await queryInterface.changeColumn("currencies", "isDelete", {
    type: Sequelize.TINYINT,
    comment: null,
  });
  await queryInterface.changeColumn("currencies", "isActive", {
    type: Sequelize.TINYINT,
    comment: null,
  });
}
