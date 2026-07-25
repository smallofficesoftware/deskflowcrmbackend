import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Sequelize as SequelizePkg } from 'sequelize';

const args = process.argv.slice(2);
const [dbType, category, action, stepArg] = args;

if (!dbType || !['master', 'tenant'].includes(dbType)) {
    console.error("Error: Please specify database type (master or tenant)");
    // console.log("Usage: node src/scripts/runMigrations.js <master|tenant> <migration|seeder|status|verify> <up|down> [steps]");
    process.exit(1);
}

if (!category || !['migration', 'seeder', 'status', 'verify'].includes(category)) {
    console.error("Error: Please specify category: migration, seeder, status, or verify");
    process.exit(1);
}

const stepsArg = Number(stepArg) || 1;
const NODE_ENV = process.env.NODE_ENV || 'production';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${NODE_ENV}`) });

const tenantQuery = 'SELECT id, company_masters_id, db_name, db_user, db_password, db_host FROM tenant_masters WHERE id > 0';

const migrationsPath = `migration/${dbType}/migrations`;
const seedersPath = `migration/${dbType}/seeders`;
const concurrency = Math.max(1, stepsArg);
const tempDir = path.join(process.cwd(), 'src', 'config', 'temp-tenants');
const masterDBConfigPath = 'src/config/database-master.js';

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(migrationsPath)) fs.mkdirSync(migrationsPath, { recursive: true });
if (!fs.existsSync(seedersPath)) fs.mkdirSync(seedersPath, { recursive: true });

const timestamp = () => new Date().getTime();

const spawnCommandStream = (cmd, argsArray, cwd = process.cwd()) =>
    new Promise((resolve, reject) => {
        const child = spawn(cmd, argsArray, { shell: true, cwd, stdio: ['inherit', 'inherit', 'inherit'] });
        child.on('error', reject);
        child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
    });

const makeTempConfigContent = (tenant, dialect) => {
    const host = tenant.db_host || tenant.dbHost || tenant.host;
    return `module.exports = {
  development: {
    username: "${tenant.db_user}",
    password: "${tenant.db_password}",
    database: "${tenant.db_name}",
    host: "${host}",
    dialect: "${dialect}",
    timezone: "+05:30",
    define: { timestamps: false },
    logging: false
  },
  production: {
    username: "${tenant.db_user}",
    password: "${tenant.db_password}",
    database: "${tenant.db_name}",
    host: "${host}",
    dialect: "${dialect}",
    timezone: "+05:30",
    define: { timestamps: false },
    logging: false
  }
};\n`;
};

const getTenants = async (masterSequelize) => {
    try {
        const [rows] = await masterSequelize.query(tenantQuery);
        return rows || [];
    } catch (error) {
        console.error('Error fetching tenants:', error.message);
        return [];
    }
};

async function verifyConnection(sequelize, label = '') {
    try {
        await sequelize.authenticate();
        const [tables] = await sequelize.query("SHOW TABLES;");
        const hasMeta = tables.some(row => Object.values(row)[0] === 'SequelizeMeta');
        if (hasMeta) {
            console.log(`Verified: ${label} connection + SequelizeMeta table OK`);
        } else {
            console.warn(`Warning: ${label} connected but missing SequelizeMeta table`);
        }
        return true;
    } catch (err) {
        console.error(`Verify failed for ${label}:`, err.message);
        return false;
    }
}

async function runMaster(category, action) {
    const dialect = 'mysql';
    if (category === 'verify') {
        const sequelize = new SequelizePkg(
            process.env.TENANT_DB_DB_NAME,
            process.env.TENANT_DB_USER_NAME,
            process.env.TENANT_DB_PASSWORD,
            {
                host: process.env.TENANT_DB_HOST_NAME,
                dialect,
                logging: false,
            }
        );
        await verifyConnection(sequelize, 'MASTER DB');
        await sequelize.close?.();
        return;
    }
    if (category === 'status') {
        await spawnCommandStream('npx', ['sequelize-cli', 'db:migrate:status', '--config', masterDBConfigPath, '--migrations-path', migrationsPath]);
        return;
    }
    const isSeeder = category === 'seeder';
    const baseCommand = isSeeder ? 'db:seed' : 'db:migrate';
    if (action === 'up') {
        const args = ['sequelize-cli', `${baseCommand}${isSeeder ? ':all' : ''}`, '--config', masterDBConfigPath];
        if (isSeeder) args.push('--seeders-path', seedersPath);
        else args.push('--migrations-path', migrationsPath);
        await spawnCommandStream('npx', args);
    } else if (action === 'down') {
        for (let i = 0; i < stepsArg; i++) {
            const args = ['sequelize-cli', `${baseCommand}:undo`, '--config', masterDBConfigPath];
            if (isSeeder) args.push('--seeders-path', seedersPath);
            else args.push('--migrations-path', migrationsPath);
            await spawnCommandStream('npx', args);
        }
    } else {
        console.error("Invalid action for master:", action);
    }
}

async function runForTenant(tenant, category, action, dialect) {
    const idOrName = String(tenant.db_name || tenant.id || 'tenant').replace(/[^a-zA-Z0-9-_]/g, '_');
    const tempFile = path.join(tempDir, `temp-tenant-config-${idOrName}-${timestamp()}.cjs`);
    try {
        await fsp.writeFile(tempFile, makeTempConfigContent(tenant, dialect), 'utf8');
        const isSeeder = category === 'seeder';
        const baseCommand = isSeeder ? 'db:seed' : 'db:migrate';
        if (category === 'verify') {
            const sequelize = new SequelizePkg(
                tenant.db_name,
                tenant.db_user,
                tenant.db_password,
                { host: tenant.db_host, dialect, logging: false }
            );
            await verifyConnection(sequelize, `Tenant ${tenant.db_name}`);
            await sequelize.close?.();
            await fsp.unlink(tempFile).catch(() => { });
            return;
        }
        if (category === 'status') {
            await spawnCommandStream('npx', ['sequelize-cli', 'db:migrate:status', '--config', tempFile, '--migrations-path', migrationsPath]);
            await fsp.unlink(tempFile).catch(() => { });
            return;
        }
        if (action === 'up') {
            const args = ['sequelize-cli', `${baseCommand}${isSeeder ? ':all' : ''}`, '--config', tempFile];
            if (isSeeder) args.push('--seeders-path', seedersPath);
            else args.push('--migrations-path', migrationsPath);
            await spawnCommandStream('npx', args);
        } else if (action === 'down') {
            for (let i = 0; i < stepsArg; i++) {
                console.log(`Tenant ${tenant.db_name}: rollback ${i + 1}/${stepsArg}`);
                const args = ['sequelize-cli', `${baseCommand}:undo`, '--config', tempFile];
                if (isSeeder) args.push('--seeders-path', seedersPath);
                else args.push('--migrations-path', migrationsPath);
                await spawnCommandStream('npx', args);
            }
        } else {
            console.error("Invalid tenant action:", action);
        }
        await fsp.unlink(tempFile).catch(() => { });
        console.log(`Tenant ${tenant.db_name}: done`);
    } catch (err) {
        console.error(`Error on tenant ${tenant.db_name}:`, err.message);
        await fsp.unlink(tempFile).catch(() => { });
    }
}

async function promisePool(items, worker, concurrencyLimit = 1) {
    const results = [];
    let idx = 0;
    async function runner() {
        while (idx < items.length) {
            const i = idx++;
            try { results[i] = await worker(items[i], i); }
            catch (e) { results[i] = e; }
        }
    }
    const runners = Array.from({ length: Math.min(concurrencyLimit, items.length) }, () => runner());
    await Promise.all(runners);
    return results;
}

(async () => {
    try {
        const dialect = 'mysql';
        console.log(`\nCommand: ${category} ${action || ''} | dbType=${dbType} | steps=${stepsArg} | env=${NODE_ENV}`);
        if (dbType === 'master') {
            console.log('\n=== Running for MASTER DB ===');
            await runMaster(category, action);
        } else if (dbType === 'tenant') {
            const masterSequelize = new SequelizePkg(
                process.env.TENANT_DB_DB_NAME,
                process.env.TENANT_DB_USER_NAME,
                process.env.TENANT_DB_PASSWORD,
                {
                    host: process.env.TENANT_DB_HOST_NAME,
                    dialect,
                    logging: false,
                    timezone: "+05:30",
                    define: { timestamps: false }
                }
            );
            const tenants = await getTenants(masterSequelize);
            if (!tenants.length) {
                console.log('No tenants found.');
                await masterSequelize.close?.();
                return;
            }
            console.log(`Found ${tenants.length} tenants. Starting...`);
            await promisePool(tenants, (t) => runForTenant(t, category, action, dialect), concurrency);
            await masterSequelize.close?.();
        }

    } catch (err) {
        console.error('Fatal error:', err.message || err);
        process.exit(1);
    }
})();
