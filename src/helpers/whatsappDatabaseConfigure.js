import { DataTypes, Sequelize } from "sequelize";

export async function fetchDataFromTempDB(dbConfig) {
    let sequelize;

    try {
        // 1 Create temporary sequelize instance
        sequelize = new Sequelize(
            dbConfig.database,
            dbConfig.username,
            dbConfig.password,
            {
                host: dbConfig.host,
                dialect: dbConfig.dialect ?? "mysql",
                logging: false,
            }
        );

        // 2 Authenticate
        await sequelize.authenticate();

        // 3 Define model (minimal)
        const Sessions = sequelize.define(
            "sessions",
            {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                },
                name: DataTypes.STRING,
                status: DataTypes.STRING,
            },
            {
                tableName: "sessions",
                timestamps: false,
            }
        );

        // 4 Fetch data
        const data = await Sessions.findAll({ where: { status: 'connected' }, raw: true });

        // 5 Return result
        return data;
    } catch (error) {
        console.error("Temporary DB error:", error);
        throw error;
    } finally {
        // 6 Close connection
        if (sequelize) {
            await sequelize.close();
        }
    }
}
