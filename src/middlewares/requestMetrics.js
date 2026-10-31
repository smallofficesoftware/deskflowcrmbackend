import crypto from "crypto";
import fs from "fs";
import path from "path";
import { monitorEventLoopDelay } from "perf_hooks";
import { tenantCacheStats } from "../config/tenantConnectionCache.js";

// Per-route and per-tenant request timing, so "what is taking the load" has an answer.
//
// - Every request is timed from entry to response finish (or client abort).
// - Every METRICS_FLUSH_MS (default 5 min) one JSON summary line is appended to
//   METRICS_LOG_FILE (default ./logs/request-metrics.log), top routes and top tenants
//   by total time, then the counters reset.
// - Requests slower than SLOW_REQUEST_MS (default 3000) print one "[slow]" line.
// - GET /api/_metrics returns the live (current window) summary. It is DISABLED (404)
//   unless env METRICS_KEY is set, and then needs header `x-metrics-key: <key>`.
//
// Overhead per request: one hrtime read and a few counter increments. Nothing about the
// request or response is changed, and no request bodies / query strings are recorded.

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 3000;
const FLUSH_MS = Number(process.env.METRICS_FLUSH_MS) || 5 * 60 * 1000;
const LOG_FILE = process.env.METRICS_LOG_FILE || path.join(process.cwd(), "logs", "request-metrics.log");
const TOP_N = 25;
const MAX_KEYS = 500; // cap label cardinality
const BUCKETS_MS = [100, 300, 1000, 3000]; // last bucket = 3000 ms and above

const newStat = () => ({ count: 0, totalMs: 0, maxMs: 0, errors: 0, aborted: 0, buckets: [0, 0, 0, 0, 0] });

let routes = new Map();
let tenants = new Map();
let windowStart = Date.now();
let inFlight = 0;
let totalRequests = 0;

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

const STATIC_PREFIXES = new Set([
    "productImg", "profile-pic", "categoryImg", "companyImg", "media-folder", "taskATH",
    "visitingCard", "attendanceImg", "product-bom-img",
]);

// "/api/Contact?x=1" -> "/api/Contact"; "/api/task-creation-crone-tab/0/30" -> ".../N/N";
// static files collapse to "/productImg/*" so file names do not explode the label count.
const normalizePath = (originalUrl) => {
    const pathOnly = String(originalUrl || "").split("?")[0];
    const parts = pathOnly.split("/").filter(Boolean);
    if (parts.length && STATIC_PREFIXES.has(parts[0])) return `/${parts[0]}/*`;
    return (
        "/" +
        parts
            .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f]{16,}$/i.test(seg) ? "N" : seg))
            .join("/")
    );
};

const addTo = (map, key, ms, isError, isAborted) => {
    let stat = map.get(key);
    if (!stat) {
        if (map.size >= MAX_KEYS) key = "OTHER";
        stat = map.get(key);
        if (!stat) {
            stat = newStat();
            map.set(key, stat);
        }
    }
    stat.count++;
    stat.totalMs += ms;
    if (ms > stat.maxMs) stat.maxMs = ms;
    if (isError) stat.errors++;
    if (isAborted) stat.aborted++;
    let i = 0;
    while (i < BUCKETS_MS.length && ms >= BUCKETS_MS[i]) i++;
    stat.buckets[i]++;
};

const tenantLabel = (req) => req.tenantDB?.config?.database || "-";

const top = (map) =>
    [...map.entries()]
        .map(([key, s]) => ({
            key,
            count: s.count,
            total_ms: Math.round(s.totalMs),
            avg_ms: Math.round(s.totalMs / s.count),
            max_ms: Math.round(s.maxMs),
            errors: s.errors,
            aborted: s.aborted,
            // <100ms, <300ms, <1s, <3s, >=3s
            buckets: s.buckets,
        }))
        .sort((a, b) => b.total_ms - a.total_ms)
        .slice(0, TOP_N);

export const getMetricsSnapshot = () => {
    const mem = process.memoryUsage();
    return {
        at: new Date().toISOString(),
        window_sec: Math.round((Date.now() - windowStart) / 1000),
        total_requests: totalRequests,
        in_flight: inFlight,
        event_loop_ms: {
            mean: Math.round(loopDelay.mean / 1e4) / 100,
            p99: Math.round(loopDelay.percentile(99) / 1e4) / 100,
            max: Math.round(loopDelay.max / 1e4) / 100,
        },
        memory_mb: { rss: Math.round(mem.rss / 1048576), heap_used: Math.round(mem.heapUsed / 1048576) },
        tenant_cache: tenantCacheStats(),
        routes: top(routes),
        tenants: top(tenants),
    };
};

const flush = () => {
    try {
        if (totalRequests > 0) {
            fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
            fs.appendFileSync(LOG_FILE, JSON.stringify(getMetricsSnapshot()) + "\n");
        }
    } catch (err) {
        console.error(`[requestMetrics] could not write ${LOG_FILE}: ${err?.message || err}`);
    } finally {
        routes = new Map();
        tenants = new Map();
        totalRequests = 0;
        windowStart = Date.now();
        loopDelay.reset();
    }
};

const flushTimer = setInterval(flush, FLUSH_MS);
flushTimer.unref?.();

export const requestMetrics = (req, res, next) => {
    const started = process.hrtime.bigint();
    inFlight++;
    let done = false;

    const finishRequest = (aborted) => {
        if (done) return;
        done = true;
        inFlight--;
        totalRequests++;
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        const key = `${req.method} ${normalizePath(req.originalUrl)}`;
        const tenant = tenantLabel(req);
        const isError = res.statusCode >= 500;
        addTo(routes, key, ms, isError, aborted);
        addTo(tenants, tenant, ms, isError, aborted);
        if (ms >= SLOW_MS) {
            console.warn(
                `[slow] ${key} ${Math.round(ms)}ms status=${res.statusCode}${aborted ? " ABORTED_BY_CLIENT" : ""} tenant=${tenant}`
            );
        }
    };

    res.on("finish", () => finishRequest(false));
    res.on("close", () => finishRequest(!res.writableFinished));
    next();
};

// GET /api/_metrics
export const metricsHandler = (req, res) => {
    const expected = process.env.METRICS_KEY;
    if (!expected) return res.status(404).end();
    const provided = Buffer.from(String(req.headers["x-metrics-key"] || ""));
    const wanted = Buffer.from(expected);
    if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
        return res.status(401).json({ ack: 0, ack_msg: "Unauthorized" });
    }
    return res.json(getMetricsSnapshot());
};
