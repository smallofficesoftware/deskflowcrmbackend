/**
 * Migration Name: add-comments-to-countries
 * Database Type: TENANT
 * Created: 25/10/2025 01:52:47 PM
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("a_countries", "id", {
    type: Sequelize.INTEGER,
    comment: "Primary key: Unique identifier for each country",
  });
  await queryInterface.changeColumn("a_countries", "country_name", {
    type: Sequelize.STRING,
    comment: "Full name of the country (e.g., United States)",
  });
  await queryInterface.changeColumn("a_countries", "country_iso", {
    type: Sequelize.STRING,
    comment: "ISO 2/3 country code (e.g., US, USA)",
  });
  await queryInterface.changeColumn("a_countries", "isDelete", {
    type: Sequelize.TINYINT,
    defaultValue: 0,
    comment: "Soft delete flag (0 = active, 1 = deleted)",
  });
  await queryInterface.changeColumn("a_countries", "isActive", {
    type: Sequelize.TINYINT,
    defaultValue: 1,
    comment: "Active status flag (0 = inactive, 1 = active)",
  });
  await queryInterface.changeColumn("a_countries", "country_code", {
    type: Sequelize.STRING,
    comment: "Country dialing code (e.g., +1, +91)",
  });
}

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("a_countries", "id", {
    type: Sequelize.INTEGER,
    comment: null,
  });
  await queryInterface.changeColumn("a_countries", "country_name", {
    type: Sequelize.STRING,
    comment: null,
  });
  await queryInterface.changeColumn("a_countries", "country_iso", {
    type: Sequelize.STRING,
    comment: null,
  });
  await queryInterface.changeColumn("a_countries", "isDelete", {
    type: Sequelize.TINYINT,
    defaultValue: 0,
    comment: null,
  });
  await queryInterface.changeColumn("a_countries", "isActive", {
    type: Sequelize.TINYINT,
    defaultValue: 1,
    comment: null,
  });
  await queryInterface.changeColumn("a_countries", "country_code", {
    type: Sequelize.STRING,
    comment: null,
  });
}
