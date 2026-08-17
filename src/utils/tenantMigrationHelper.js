import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Sequelize as SequelizePkg } from 'sequelize';
import { ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE } from './appConstants.js';
import logger from './logger.js';

const tempDir = path.join(process.cwd(), 'src', 'config', 'temp-tenants');
const migrationsPath = `migration/tenant/migrations`;
const seedersPath = `migration/tenant/seeders`;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Ensure temp directory exists
const ensureTempDir = async () => {
    try {
        await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
        // Directory might already exist, ignore the error
    }
};

const timestamp = () => new Date().getTime();

const spawnCommandStream = (cmd, argsArray, cwd = process.cwd()) =>
    new Promise((resolve, reject) => {
        const child = spawn(cmd, argsArray, {
            shell: true,
            cwd,
            stdio: ['inherit', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
            stdout += data;
            process.stdout.write(data);
        });

        child.stderr?.on('data', (data) => {
            stderr += data;
            process.stderr.write(data);
        });

        child.on('error', (error) => {
            logger.error(`Command spawn error: ${error.message}`);
            reject(error);
        });

        child.on('exit', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`${cmd} exited with code ${code}. stderr: ${stderr}`));
            }
        });
    });

const makeTempConfigContent = (tenant, dialect = 'mysql') => {
    const host = tenant.db_host || tenant.dbHost || tenant.host;
    const envBlock = `{
    username: "${tenant.db_user}",
    password: "${tenant.db_password}",
    database: "${tenant.db_name}",
    host: "${host}",
    dialect: "${dialect}",
    timezone: "+05:30",
    define: { timestamps: false },
    logging: false
  }`;
    return `module.exports = {
  development: ${envBlock},
  production: ${envBlock},
  "${NODE_ENV}": ${envBlock}
};\n`;
};

/**
 * Run tenant migrations for a specific tenant database
 * @param {Object} tenantInfo - Tenant database information
 * @param {string} tenantInfo.db_name - Database name
 * @param {string} tenantInfo.db_user - Database username
 * @param {string} tenantInfo.db_password - Database password
 * @param {string} tenantInfo.db_host - Database host
 * @returns {Promise<Object>} Migration result
 */
export const runTenantMigrations = async (tenantInfo) => {
    await ensureTempDir();

    const idOrName = String(tenantInfo.db_name || 'tenant').replace(/[^a-zA-Z0-9-_]/g, '_');
    const tempFile = path.join(tempDir, `temp-tenant-config-${idOrName}-${timestamp()}.cjs`);

    try {
        logger.info(`Starting tenant migrations for database: ${tenantInfo.db_name}`);

        // Create temporary config file
        await fs.writeFile(tempFile, makeTempConfigContent(tenantInfo), 'utf8');

        // Run migrations
        const args = [
            'sequelize-cli',
            'db:migrate',
            '--config',
            tempFile,
            '--migrations-path',
            migrationsPath
        ];

        logger.info(`Running migrations: npx ${args.join(' ')}`);

        const result = await spawnCommandStream('npx', args);

        logger.info(`Tenant migrations completed successfully for database: ${tenantInfo.db_name}`);

        return {
            success: true,
            message: `Migrations completed for ${tenantInfo.db_name}`,
            output: result.stdout
        };

    } catch (error) {
        logger.error(`Error running tenant migrations for ${tenantInfo.db_name}:`, error.message);
        return {
            success: false,
            message: `Migration failed for ${tenantInfo.db_name}: ${error.message}`,
            error: error.message
        };
    } finally {
        // Clean up temporary config file
        try {
            await fs.unlink(tempFile);
        } catch (cleanupError) {
            logger.warn(`Failed to cleanup temp file ${tempFile}:`, cleanupError.message);
        }
    }
};

/**
 * Run tenant seeders for a specific tenant database
 * @param {Object} tenantInfo - Tenant database information
 * @param {string} tenantInfo.db_name - Database name
 * @param {string} tenantInfo.db_user - Database username
 * @param {string} tenantInfo.db_password - Database password
 * @param {string} tenantInfo.db_host - Database host
 * @returns {Promise<Object>} Seeder result
 */
export const runTenantSeeders = async (tenantInfo) => {
    await ensureTempDir();

    const idOrName = String(tenantInfo.db_name || 'tenant').replace(/[^a-zA-Z0-9-_]/g, '_');
    const tempFile = path.join(tempDir, `temp-tenant-config-${idOrName}-${timestamp()}.cjs`);

    try {
        logger.info(`Starting tenant seeders for database: ${tenantInfo.db_name}`);

        // Create temporary config file
        await fs.writeFile(tempFile, makeTempConfigContent(tenantInfo), 'utf8');

        // Run seeders
        const args = [
            'sequelize-cli',
            'db:seed:all',
            '--config',
            tempFile,
            '--seeders-path',
            seedersPath
        ];

        logger.info(`Running seeders: npx ${args.join(' ')}`);

        const result = await spawnCommandStream('npx', args);

        logger.info(`Tenant seeders completed successfully for database: ${tenantInfo.db_name}`);

        return {
            success: true,
            message: `Seeders completed for ${tenantInfo.db_name}`,
            output: result.stdout
        };

    } catch (error) {
        logger.error(`Error running tenant seeders for ${tenantInfo.db_name}:`, error.message);
        return {
            success: false,
            message: `Seeder failed for ${tenantInfo.db_name}: ${error.message}`,
            error: error.message
        };
    } finally {
        // Clean up temporary config file
        try {
            await fs.unlink(tempFile);
        } catch (cleanupError) {
            logger.warn(`Failed to cleanup temp file ${tempFile}:`, cleanupError.message);
        }
    }
};

/**
 * Check if tenant migrations are enabled via environment variable
 * @returns {boolean} Whether migrations are enabled
 */
export const isTenantMigrationEnabled = () => {
    return ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE;
};

/**
 * Run both migrations and seeders for a tenant database
 * @param {Object} tenantInfo - Tenant database information
 * @param {boolean} skipEnvCheck - Skip environment variable check (for manual execution)
 * @returns {Promise<Object>} Combined result
 */
export const runTenantMigrationsAndSeeders = async (tenantInfo, skipEnvCheck = false) => {
    try {
        // Check environment variable unless explicitly skipped
        if (!skipEnvCheck && !ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE) {
            logger.info(`Tenant migrations and seeders disabled by environment variable for: ${tenantInfo.db_name}`);
            return {
                success: false,
                message: `Tenant migrations and seeders are disabled by ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE environment variable`,
                migrationResult: null,
                seederResult: null,
                disabled: true
            };
        }

        logger.info(`Starting tenant migrations and seeders for: ${tenantInfo.db_name}`);

        // Run migrations first
        const migrationResult = await runTenantMigrations(tenantInfo); if (!migrationResult.success) {
            return {
                success: false,
                message: `Migration failed, skipping seeders: ${migrationResult.message}`,
                migrationResult,
                seederResult: null
            };
        }

        // Run seeders after successful migrations
        const seederResult = await runTenantSeeders(tenantInfo);

        return {
            success: migrationResult.success && seederResult.success,
            message: `Migrations and seeders ${migrationResult.success && seederResult.success ? 'completed' : 'had issues'} for ${tenantInfo.db_name}`,
            migrationResult,
            seederResult
        };

    } catch (error) {
        logger.error(`Error in runTenantMigrationsAndSeeders:`, error.message);
        return {
            success: false,
            message: `Failed to run migrations and seeders: ${error.message}`,
            error: error.message,
            migrationResult: null,
            seederResult: null
        };
    }
};

/**
 * Verify tenant database connection and SequelizeMeta table
 * @param {Object} tenantInfo - Tenant database information
 * @returns {Promise<boolean>} Connection verification result
 */
export const verifyTenantConnection = async (tenantInfo) => {
    let sequelize;
    try {
        sequelize = new SequelizePkg(
            tenantInfo.db_name,
            tenantInfo.db_user,
            tenantInfo.db_password,
            {
                host: tenantInfo.db_host,
                dialect: 'mysql',
                logging: false,
                timezone: "+05:30",
                define: { timestamps: false }
            }
        );

        await sequelize.authenticate();

        const [tables] = await sequelize.query("SHOW TABLES;");
        const hasMeta = tables.some(row => Object.values(row)[0] === 'SequelizeMeta');

        if (hasMeta) {
            logger.info(`Verified: ${tenantInfo.db_name} connection + SequelizeMeta table OK`);
        } else {
            logger.warn(`Warning: ${tenantInfo.db_name} connected but missing SequelizeMeta table`);
        }

        return true;

    } catch (error) {
        logger.error(`Verify failed for ${tenantInfo.db_name}:`, error.message);
        return false;
    } finally {
        if (sequelize) {
            await sequelize.close();
        }
    }
};