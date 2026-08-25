/**
 * Migration Name: create-reviews
 * Database Type: MASTER
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("reviews", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
    },
    rating: {
      type: Sequelize.TINYINT,
    },
    review_type: {
      type: Sequelize.ENUM("system", "playstore", "appstore"),
    },
    comment: {
      type: Sequelize.TEXT,
    },
    platform: {
      type: Sequelize.ENUM("app", "web"),
    },
    is_completed: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    rating_given_date: {
      type: Sequelize.DATE,
    },
    last_asked_date: {
      type: Sequelize.DATE,
    },
    store_prompt_last_asked_date: {
      type: Sequelize.DATE,
    },
    store_review_completed: {
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
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
    isActive: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
  });

  await queryInterface.addIndex("reviews", {
    fields: ["company_masters_id", "a_application_login_id"],
    name: "idx_reviews_company_login",
    unique: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("reviews");
};
