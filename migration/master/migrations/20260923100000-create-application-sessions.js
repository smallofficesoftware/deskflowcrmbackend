/**
 * Migration Name: create-application-sessions
 * Database Type: MASTER
 *
 * Server-side session record per (login, platform), so the active
 * company_masters_id for a login is resolved from here instead of trusting
 * each device's own JWT claim. Fixes cross-device drift where two devices
 * logged in under the same user end up pinned to different companies
 * (each JWT bakes in companyId at issue time and is never re-checked),
 * which showed up as ticket #2559 — check-in done on one device not
 * recognized by another device for a multi-company login.
 *
 * Runs alongside the existing web_device_token/ios_device_token/
 * android_device_token columns on a_application_logins (single-session-
 * per-platform enforcement) — this table does not replace that mechanism.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("application_sessions", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    platform: {
      type: Sequelize.STRING(20),
      allowNull: false,
      comment: "web|ios|android",
    },
    jwt_jti: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    issued_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    isDelete: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
    },
  });

  await queryInterface.addIndex("application_sessions", {
    fields: ["a_application_login_id", "platform"],
    unique: true,
    name: "uq_application_sessions_login_platform",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("application_sessions");
};
