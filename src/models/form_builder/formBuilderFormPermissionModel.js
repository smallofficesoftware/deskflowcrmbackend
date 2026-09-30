import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

// Per-form special permissions (Form Builder v2 section 3/7 — "Permissions"
// tab). One row = one permission_key granted to either one login
// (a_application_login_id) or one team (team_id = departments.id; members
// are the logins whose a_application_logins.department is that id).
// Exactly one of the two is set. Keys: see FORM_PERMISSION_KEYS in
// services/form_builder/formBuilderPermissions.js.
export const formBuilderFormPermissionModel = (sequelize) => {
  return sequelize.define(
    "form_builder_form_permissions",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      form_id: {
        type: INTEGER,
      },
      permission_key: {
        type: STRING(50),
      },
      a_application_login_id: {
        type: INTEGER,
        allowNull: true,
      },
      team_id: {
        type: INTEGER,
        allowNull: true,
      },
      isDelete: {
        type: TINYINT,
        defaultValue: 0,
      },
      isActive: {
        type: TINYINT,
        defaultValue: 1,
      },
    },
    {
      timestamps: true,
      createdAt: "created_date_time",
      updatedAt: "modified_date",
    },
  );
};
