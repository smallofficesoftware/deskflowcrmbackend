import { INTEGER, STRING, JSON } from "sequelize";

export const whatsappSessionTokenModel = (sequelize) => {
    return sequelize.define("whatsapp_session_token", {
        id: {
            type: INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        token_data: {
            type: JSON,
            allowNull: true
        },
        session_name: {
            type: STRING(255),
            allowNull: false,
            unique: true
        },
    }, {
        tableName: "whatsapp_session_token",
        timestamps: false,
        underscored: true
    });
}
