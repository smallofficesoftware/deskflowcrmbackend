// Cache for per-tenant Sequelize connections (used by getTenantDB in dbManager.js).
//
// Before: every request built a new Sequelize instance + ~60 models and opened a new
// connection pool that was never closed (the old cleanup middleware was not mounted),
// so each request paid a TCP/auth handshake and leaked connections until MySQL's
// wait_timeout killed them.
//
// Now: one Sequelize instance + model set per tenant DB, reused by all requests, with
// a bounded pool, idle eviction, and a short-lived cache of the tenant_masters row.

const TENANT_ROW_TTL_MS = Number(process.env.TENANT_ROW_CACHE_TTL_MS) || 60 * 1000;
const CONNECTION_IDLE_EVICT_MS = Number(process.env.TENANT_CONN_IDLE_EVICT_MS) || 15 * 60 * 1000;
const MAX_CACHED_CONNECTIONS = Number(process.env.TENANT_CONN_CACHE_MAX) || 150;
const RECENT_USE_GUARD_MS = 2 * 60 * 1000; // never evict a connection used in the last 2 min
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export const TENANT_POOL = {
    max: Number(process.env.TENANT_POOL_MAX) || 15,
    min: 0,
    acquire: Number(process.env.TENANT_POOL_ACQUIRE_MS) || 30000,
    idle: 10000,
    evict: 10000,
};

const rowCache = new Map(); // "c:<companyId>" | "t:<tenantId>" -> { row, at }
const connections = new Map(); // "<host>|<db>|<user>|<pw>" -> { sequelize, models, realClose, lastUsed }

// ---- tenant_masters row cache ---------------------------------------------------

export const cachedTenantRow = async (key, loader) => {
    const hit = rowCache.get(key);
    if (hit && Date.now() - hit.at < TENANT_ROW_TTL_MS) return hit.row;
    const row = await loader();
    if (row) rowCache.set(key, { row, at: Date.now() }); // never cache "not found"
    else rowCache.delete(key);
    return row;
};

// ---- connection cache -------------------------------------------------------------

export const tenantConnectionKey = (tenant) =>
    `${tenant.db_host}|${tenant.db_name}|${tenant.db_user}|${tenant.db_password}`;

// Returns a request-safe view: models is a shallow copy so request code that writes
// into the models proxy (sequelize.js modelsProxy.set) cannot leak between requests.
const view = (entry) => ({ sequelize: entry.sequelize, models: { ...entry.models } });

export const getCachedConnection = (key) => {
    const entry = connections.get(key);
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return view(entry);
};

export const storeConnection = (key, sequelize, models) => {
    // Existing code calls sequelize.close() after a request in several places. With a
    // shared instance that would kill everybody's pool, so close() becomes a no-op and
    // the real close is only used by eviction below.
    const realClose = sequelize.close.bind(sequelize);
    sequelize.close = async () => {};

    const entry = { sequelize, models, realClose, lastUsed: Date.now() };
    connections.set(key, entry);
    evictOverflow();
    return view(entry);
};

const evictEntry = async (key) => {
    const entry = connections.get(key);
    if (!entry) return;
    connections.delete(key);
    try {
        await entry.realClose();
    } catch (err) {
        console.error(`[tenantConnectionCache] close failed: ${err?.message || err}`);
    }
};

const evictOverflow = () => {
    if (connections.size <= MAX_CACHED_CONNECTIONS) return;
    const now = Date.now();
    const oldestFirst = [...connections.entries()]
        .filter(([, e]) => now - e.lastUsed > RECENT_USE_GUARD_MS)
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    let over = connections.size - MAX_CACHED_CONNECTIONS;
    for (const [key] of oldestFirst) {
        if (over-- <= 0) break;
        evictEntry(key);
    }
};

const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of connections.entries()) {
        if (now - entry.lastUsed > CONNECTION_IDLE_EVICT_MS) evictEntry(key);
    }
    for (const [key, hit] of rowCache.entries()) {
        if (now - hit.at > TENANT_ROW_TTL_MS) rowCache.delete(key);
    }
};

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
sweepTimer.unref?.(); // never keep the process alive just for this

// Call after changing a tenant's DB credentials / host (or restoring its DB).
export const invalidateTenantCache = async () => {
    rowCache.clear();
    for (const key of [...connections.keys()]) await evictEntry(key);
};

export const tenantCacheStats = () => ({
    connections: connections.size,
    tenantRows: rowCache.size,
});
