import crypto from "crypto";

// Guards the endpoints that the server crontab calls with curl (/api/*-crone-tab etc).
//
// The old inline checks in cronJobServices.js are commented out, so these endpoints were
// callable by anyone. This middleware enforces a shared key instead.
//
// Key comes from env CRONE_TAB_PRIVACY_KEY. Rollout safety: while the env var is NOT set
// the guard lets the request through and logs one warning (so a deploy cannot break the
// crontab before the key is configured). Once the var is set, requests without the right
// key get 401.
//
// Header: send `crone-tab-privacy: <key>` (hyphens). The old `crone_tab_privacy`
// (underscores) is also accepted, but nginx drops headers with underscores unless
// `underscores_in_headers on;` is set, so the crontab should use the hyphenated name.

let warnedMissingKey = false;

const safeEqual = (a, b) => {
    const bufA = Buffer.from(String(a ?? ""));
    const bufB = Buffer.from(String(b ?? ""));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

export const cronKeyGuard = (req, res, next) => {
    const expected = process.env.CRONE_TAB_PRIVACY_KEY;

    if (!expected) {
        if (!warnedMissingKey) {
            warnedMissingKey = true;
            console.warn("[cronKeyGuard] CRONE_TAB_PRIVACY_KEY is not set - cron endpoints are NOT protected");
        }
        return next();
    }

    const provided = req.headers["crone-tab-privacy"] ?? req.headers["crone_tab_privacy"];
    if (safeEqual(provided, expected)) {
        return next();
    }

    console.warn(`[cronKeyGuard] rejected ${req.method} ${req.originalUrl} from ${req.ip}`);
    return res.status(401).json({ ack: 0, ack_msg: "Unauthorized cron request" });
};
