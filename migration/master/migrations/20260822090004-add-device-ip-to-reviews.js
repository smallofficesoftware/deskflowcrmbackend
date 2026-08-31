/**
 * Migration Name: add-device-ip-to-reviews
 * Database Type: MASTER
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("reviews", "device_id", {
    type: Sequelize.STRING,
  });
  await queryInterface.addColumn("reviews", "ip_address", {
    type: Sequelize.STRING,
  });
  await queryInterface.changeColumn("reviews", "platform", {
    type: Sequelize.ENUM("web", "android", "ios"),
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.removeColumn("reviews", "device_id");
  await queryInterface.removeColumn("reviews", "ip_address");
  await queryInterface.changeColumn("reviews", "platform", {
    type: Sequelize.ENUM("app", "web"),
  });
};
