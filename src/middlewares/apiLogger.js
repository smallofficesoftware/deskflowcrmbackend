import { insertApiLog } from '../services/activities/logService.js';
import { API_LOG_ENABLE_FLAG } from '../utils/appConstants.js';

const skipPatterns = [
    /^\/api\/sync-product/,
    /^\/api\/sync-invoice/,
    /^\/api\/generate-ledger/,
    /^\/api\/generate-outstanding/,
    /^\/api\/webhookmiracle(\/|$)/,
];
const apiLogger = (req, res, next) => {

    if (API_LOG_ENABLE_FLAG == 'false') {
        return next();
    }

    // Skip unwanted routes
    if (!skipPatterns.some(route => route.test(req.originalUrl))) {
        return next();
    }

    const start = Date.now();

    const originalSend = res.send;

    res.send = function (body) {
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
                            ? JSON.stringify(body).slice(0, 1000)
                            : null,
                    tenentDb: req.tenantDB
                });
            } catch (err) {
                // console.log("apiLogger error", err)
                // ignore logging errors
            }
        });

        return result;
    };

    next();
};

export default apiLogger;