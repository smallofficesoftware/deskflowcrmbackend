// Optional Sentry error reporting. Does nothing unless env SENTRY_DSN is set AND the
// @sentry/node package is installed (npm i @sentry/node), so it is safe to deploy
// everywhere and switch on per server.
//
// Per server .env:
//   SENTRY_DSN=<dsn of the Sentry project>
//   SENTRY_ENVIRONMENT=demo | sandbox | production      (shown as a filter in Sentry)
//   SENTRY_SERVER_NAME=demobackend | sandboxbackend | backend   (optional)
//   SENTRY_RELEASE=<git sha>                              (optional)
//   SENTRY_TRACES_SAMPLE_RATE=0                           (performance traces; leave 0)
//
// Privacy: request bodies, cookies, headers and query strings are never sent
// (sendDefaultPii is off and beforeSend strips them). console.error calls are reported
// too, because most failures in this codebase are caught and only console.error'ed
// (ETIMEDOUT, Sheets quota, FCM timeouts). They are grouped by a normalized message so
// per-user tokens and ids do not create thousands of separate issues.

let Sentry = null;

const normalize = (text) =>
    String(text || "")
        .replace(/[A-Za-z0-9_:\-]{24,}/g, "<tok>")
        .replace(/\d+/g, "N")
        .slice(0, 120);

export const initSentry = async () => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return false;

    try {
        Sentry = await import("@sentry/node");
    } catch {
        console.warn("[sentry] SENTRY_DSN is set but @sentry/node is not installed (run: npm i @sentry/node)");
        return false;
    }

    const integrations = [];
    if (typeof Sentry.captureConsoleIntegration === "function") {
        integrations.push(Sentry.captureConsoleIntegration({ levels: ["error"] }));
    }

    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "unknown",
        release: process.env.SENTRY_RELEASE || undefined,
        serverName: process.env.SENTRY_SERVER_NAME || undefined,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
        sendDefaultPii: false,
        integrations,
        beforeSend(event) {
            if (event.request) {
                delete event.request.data;
                delete event.request.cookies;
                delete event.request.headers;
                delete event.request.query_string;
                if (event.request.url) event.request.url = String(event.request.url).split("?")[0];
            }
            const message = event.logentry?.message || event.message;
            if (message) {
                event.fingerprint = [normalize(message)];
                const cut = String(message).slice(0, 300);
                if (event.logentry) event.logentry.message = cut;
                if (event.message) event.message = cut;
            }
            return event;
        },
    });
    console.warn(`[sentry] enabled, environment=${process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV}`);
    return true;
};

export const captureError = (err) => {
    try {
        if (Sentry) Sentry.captureException(err);
    } catch {
        /* never let reporting break a request */
    }
};
