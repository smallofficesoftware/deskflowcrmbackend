/**
 * Migration Name: create-company-feature-flags
 * Database Type: MASTER
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("company_feature_flags", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
    },
    feature_key: {
      type: Sequelize.STRING,
    },
    is_enabled: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    created_date_time: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    modified_date: {
      type: Sequelize.DATE,
    },
    modify_by: {
      type: Sequelize.INTEGER,
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

  await queryInterface.addIndex("company_feature_flags", {
    fields: ["company_masters_id", "feature_key"],
    name: "idx_company_feature_flags_company_key",
    unique: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("company_feature_flags");
};
