import { DataTypes } from "sequelize";

export const whatsappTemplateConfigsModel = (sequelize) => {
    return sequelize.define(
        "whatsapp_template_configs",
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },

            module: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            displayModule: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },

            template_id: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },

            template_name: {
                type: DataTypes.STRING(200),
                allowNull: false,
            },
            language: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },

            variable_mappings: {
                type: DataTypes.JSON,
                allowNull: false,
            },
            attachment_variable_key: {
                type: DataTypes.STRING(100),
                allowNull: true,
                defaultValue: null,
            },
            attachment_source_type: {
                type: DataTypes.STRING(100),
                allowNull: true,
                defaultValue: null,
            },
            static_attachment_url: {
                type: DataTypes.STRING(255),
                allowNull: true,
                defaultValue: null,
            },
            static_attachment_file_name: {
                type: DataTypes.STRING(100),
                allowNull: true,
                defaultValue: null,
            },

            user_id: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            isDelete: {
                type: DataTypes.TINYINT,
                allowNull: false,
                defaultValue: 0,
            },

            isActive: {
                type: DataTypes.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
        },
        {
            tableName: "whatsapp_template_configs",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",

            indexes: [
                // module+template_id only (NOT +user_id) — every read path
                // (whatsappTemplateConfigs/whatsappTemplateConfigGet,
                // sendWhatsappTemplateViaBackend) already treats this as one
                // config per module+template, not per user; the unique key
                // used to also include user_id, which let an edit under a
                // different/missing a_application_login_id insert a
                // duplicate row instead of updating the existing one — see
                // migration 20260911120000-fix-whatsapp-template-configs-unique-key.js.
                {
                    unique: true,
                    fields: ["module", "template_id"],
                    name: "unique_module_template",
                },
                {
                    fields: ["displayModule"],
                    name: "displayModule",
                },
                {
                    fields: ["module"],
                    name: "idx_template_configs_module",
                },
                {
                    fields: ["user_id"],
                    name: "idx_template_configs_user",
                },
            ],
        }
    );
};