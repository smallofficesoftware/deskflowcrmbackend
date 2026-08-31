import { insertApiLog } from '../services/activities/logService.js';
import { insertMiracleLog } from '../services/activities/miracleLogService.js';
import { insertThirdPartyLog } from '../services/activities/thirdPartyLogService.js';
import { API_LOG_ENABLE_FLAG } from '../utils/appConstants.js';

const miracleApiPatterns = [
    /^\/api\/sync-product/,
    /^\/api\/sync-invoice/,
    /^\/api\/sync-case-bank-pr/,
    /^\/api\/generate-ledger/,
    /^\/api\/generate-outstanding/,
    /^\/api\/product-sync/,
    /^\/api\/contact-sync/,
    /^\/api\/bulk-sync-miracle-modules/,
];

// Every other third-party integration this app talks to - Miracle has its
// own dedicated whitelist/table above (miracle_logs), these all land in the
// separate third_party_logs table instead. Disjoint URL sets from Miracle's,
// so a request only ever matches one of the two - no double-logging.
const thirdPartyApiPatterns = [
    { pattern: /^\/api\/India-mart/i, integration: "INDIAMART", direction: "OUTBOUND" },
    { pattern: /^\/api\/webhookindiamart(\/|$)/i, integration: "INDIAMART", direction: "INBOUND" },
    { pattern: /^\/api\/trade-india-buy-leads/i, integration: "TRADEINDIA_BUY_LEADS", direction: "OUTBOUND" },
    { pattern: /^\/api\/trade-india/i, integration: "TRADEINDIA", direction: "OUTBOUND" },
    { pattern: /^\/api\/webhookjustdial(\/|$)/i, integration: "JUSTDIAL", direction: "INBOUND" },
    { pattern: /^\/api\/google-sheet-for-facebook/i, integration: "GOOGLESHEET", direction: "OUTBOUND" },
    { pattern: /^\/api\/get-google-sheet-columns/i, integration: "GOOGLESHEET", direction: "OUTBOUND" },
    { pattern: /^\/api\/update-google-sheet-columns/i, integration: "GOOGLESHEET", direction: "OUTBOUND" },
    { pattern: /^\/api\/verify-payment-razorpay/i, integration: "RAZORPAY", direction: "OUTBOUND" },
    { pattern: /^\/api\/razorpay/i, integration: "RAZORPAY", direction: "OUTBOUND" },
    { pattern: /^\/api\/gimini/i, integration: "GEMINI", direction: "OUTBOUND" },
    { pattern: /^\/api\/send-whatsapp-template/i, integration: "WHATSAPP_SEND", direction: "OUTBOUND" },
    { pattern: /^\/api\/whatsapp-sender-messages/i, integration: "WHATSAPP_WEBHOOK", direction: "INBOUND" },
];

function inferCrmModule(url = "") {
    const u = url.toLowerCase();
    if (u.includes("product")) return "product";
    if (u.includes("contact")) return "contact";
    if (u.includes("invoice")) return "invoice";
    if (u.includes("ledger")) return "ledger";
    if (u.includes("outstanding")) return "outstanding";
    if (u.includes("bulk-sync")) return "bulk_sync";
    return "miracle";
}

const apiLogger = (req, res, next) => {

    if (API_LOG_ENABLE_FLAG == 'false') {
        return next();
    }

    const isMiracleCrmApi = miracleApiPatterns.some(route => route.test(req.originalUrl));
    const isWebhook = /^\/api\/webhookmiracle(\/|$)/.test(req.originalUrl);
    const matchedThirdParty = thirdPartyApiPatterns.find(entry => entry.pattern.test(req.originalUrl));

    if (!isMiracleCrmApi && !isWebhook && !matchedThirdParty) {
        return next();
    }

    const start = Date.now();

    const originalSend = res.send;

    res.send = function (body) {
        if (res._isAlreadyLogged) {
            return originalSend.call(this, body);
        }
        res._isAlreadyLogged = true;

        const responseTime = Date.now() - start;

        // send response first
        const result = originalSend.call(this, body);

        // AFTER response → log async
        setImmediate(() => {
            try {
                const ip =
                    req.headers['x-forwarded-for']?.split(',')[0] ||
                    req.socket?.remoteAddress ||
                    req.ip;

                // 1. Legacy API log
                insertApiLog({
                    company_id: req.user?.company_id || null,
                    method: req.method,
                    url: req.originalUrl,
                    status_code: res.statusCode,
                    response_time: responseTime,
                    ip_address: ip,
                    user_agent: req.headers['user-agent'],
                    level: res.statusCode >= 400 ? 'error' : 'info',
                    requestBody: req.body ? JSON.stringify(req.body).slice(0, 1000) : "",
                    error:
                        res.statusCode >= 400
                            ? (typeof body === 'string' ? body.slice(0, 1000) : JSON.stringify(body).slice(0, 1000))
                            : null,
                    tenentDb: req.tenantDB
                });

                // 2. High-fidelity CRM_API log for Miracle dashboard
                if (isMiracleCrmApi && req.tenantDB) {
                    const moduleName = inferCrmModule(req.originalUrl);
                    insertMiracleLog(req.tenantDB, {
                        log_type: "CRM_API",
                        module_name: moduleName,
                        action_type: req.method?.toUpperCase() || "POST",
                        url: req.originalUrl,
                        method: req.method?.toUpperCase() || "POST",
                        status_code: res.statusCode,
                        status: res.statusCode >= 400 ? "FAILED" : "SUCCESS",
                        response_time: responseTime,
                        request_payload: req.body,
                        response_payload: body,
                        error_message: res.statusCode >= 400 ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
                        company_masters_id: req.user?.company_id || null,
                    });
                }

                // 3. Third-party integration log (everything except Miracle)
                if (matchedThirdParty && req.tenantDB) {
                    insertThirdPartyLog(req.tenantDB, {
                        integration: matchedThirdParty.integration,
                        direction: matchedThirdParty.direction,
                        module_name: matchedThirdParty.integration.toLowerCase(),
                        url: req.originalUrl,
                        method: req.method?.toUpperCase() || "POST",
                        status_code: res.statusCode,
                        status: res.statusCode >= 400 ? "FAILED" : "SUCCESS",
                        response_time: responseTime,
                        request_payload: req.body,
                        response_payload: body,
                        error_message: res.statusCode >= 400 ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
                        company_masters_id: req.user?.company_id || null,
                        a_application_login_id: req.body?.a_application_login_id || null,
                    });
                }
            } catch (err) {
                // ignore logging errors
            }
        });

        return result;
    };

    next();
};

export default apiLogger;