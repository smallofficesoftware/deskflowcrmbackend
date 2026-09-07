/**
 * Migration Name: create-report-definition-team-rights
 * Database Type: TENANT
 *
 * Per-report (not per-page) grant: which specific report_definitions a
 * specific a_application_login_id is allowed to see/run, and their data
 * scope for it (own/all/chain). Row presence alone is the visibility rule —
 * no row means no access, full stop, independent of any page-level right.
 * See reportDefinitionServices.js's listRunnableReportDefinitions and
 * dataScopeService.js's getReportDataScope.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("report_definition_team_rights", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    report_definition_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    a_application_login_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    data_scope: {
      type: Sequelize.ENUM("own", "all", "chain"),
      allowNull: false,
      defaultValue: "own",
    },
    created_date_time: {
      type: Sequelize.DATE,
      allowNull: false,
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

  await queryInterface.addIndex("report_definition_team_rights", {
    fields: ["report_definition_id", "a_application_login_id"],
    unique: true,
    name: "uniq_report_login",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("report_definition_team_rights");
};
