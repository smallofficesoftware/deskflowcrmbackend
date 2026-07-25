import { DataTypes } from "sequelize";

/**
 * Get DATE / DATEONLY / TIME columns with type info from Sequelize model
 *
 * @param {Model} model - Sequelize model
 * @param {Object} options
 * @param {boolean} options.excludeTimestamps - Exclude createdAt & updatedAt
 * @returns {Array<{column: string, type: string}>}
 */
export function getDateTimeColumnsWithType(model, options = {}) {
    const { excludeTimestamps = false } = options;

    if (!model || !model.rawAttributes) {
        throw new Error("Invalid Sequelize model passed");
    }

    const dateTypes = [
        DataTypes.DATE,
        DataTypes.DATEONLY,
        DataTypes.TIME
    ];

    return Object.entries(model.rawAttributes)
        .filter(([column, attr]) => {
            if (excludeTimestamps && ["created_date_time", "modified_date"].includes(column)) {
                return false;
            }

            return dateTypes.some(type => attr.type instanceof type);
        })
        .map(([column, attr]) => ({
            column,
            type: attr.type.key
        }));
}
