// Guard helpers for the Google Sheets lead sync (googleSheetIntegrationService.js).
//
// Why this exists: the sync runs for every company on one Google project, whose
// limit is 60 read requests per minute. Without pacing, a cron run floods the quota
// (thousands of 429s a day), broken sheet configs are retried forever, and each
// failure logs a huge GaxiosError. State here is in memory (per process); it resets
// on restart, which is fine - it only exists to stop hammering Google.

const SHEET_GAP_MS = 2000; // min spacing between two sheet syncs (global)
const QUOTA_COOLDOWN_MS = 65 * 1000; // after a 429, make no Google calls for this long
const BROKEN_TTL_MS = 6 * 60 * 60 * 1000; // skip a broken sheet config for 6 hours
const HEADER_TTL_MS = 30 * 60 * 1000; // reuse cached header row for 30 minutes

let lastCallAt = 0;
let quotaBlockedUntil = 0;
const brokenSheets = new Map(); // key -> { until, reason }
const sheetCache = new Map(); // key -> { headers, headersAt, lastRow }

export const MAX_SHEET_CACHE_AGE_MS = HEADER_TTL_MS;

export const sheetKey = (spreadsheetId, sheetName) => `${spreadsheetId}|${sheetName}`;

const errText = (err) => String(err?.message || err || "");

export const isQuotaError = (err) =>
    String(err?.code) === "429" ||
    String(err?.status) === "429" ||
    err?.response?.status === 429 ||
    /quota exceeded|rate limit|too many requests/i.test(errText(err));

// Errors that will fail the same way on every run until the user fixes the sheet.
export const isPermanentSheetError = (err) =>
    /unable to parse range|'id' column not found|requested entity was not found|no sheet with name|permission|does not have permission/i.test(
        errText(err)
    ) ||
    String(err?.code) === "404" ||
    String(err?.code) === "403";

// One short line instead of the full GaxiosError (stack + request config + headers).
export const compactError = (err) => {
    const code = err?.code || err?.status || "";
    const msg = errText(err).split("\n")[0].slice(0, 200);
    return `${code ? `[${code}] ` : ""}${msg}`;
};

export const isQuotaBlocked = () => Date.now() < quotaBlockedUntil;

export const markQuotaHit = () => {
    quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
};

export const getBrokenReason = (key) => {
    const entry = brokenSheets.get(key);
    if (!entry) return null;
    if (Date.now() > entry.until) {
        brokenSheets.delete(key);
        return null;
    }
    return entry.reason;
};

export const markBroken = (key, reason) => {
    brokenSheets.set(key, { until: Date.now() + BROKEN_TTL_MS, reason });
};

// Space out sheet syncs so the whole process stays under the per-minute read quota.
export const throttleSheetCall = async () => {
    const wait = lastCallAt + SHEET_GAP_MS - Date.now();
    lastCallAt = Math.max(Date.now(), lastCallAt + SHEET_GAP_MS);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
};

export const getSheetCache = (key) => sheetCache.get(key) || null;
export const setSheetCache = (key, value) => {
    sheetCache.set(key, value);
};
export const clearSheetCache = (key) => {
    sheetCache.delete(key);
};
