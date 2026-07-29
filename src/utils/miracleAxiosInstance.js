import axios from 'axios';
import https from 'https';
import { getValidAccessToken } from '../middlewares/miracleTokenManager.js';
import { insertApiLog } from '../services/activities/logService.js';
import { insertMiracleLog } from '../services/activities/miracleLogService.js';

function inferModuleFromUrl(url = "") {
    const u = (url || "").toLowerCase();
    if (u.includes("productledger") || u.includes("product")) return "product";
    if (u.includes("accountledger") || u.includes("account")) return "contact";
    if (u.includes("voucher")) return "invoice";
    if (u.includes("generatefile")) return "report";
    if (u.includes("token")) return "auth";
    return "miracle";
}

export const createAxiosIntance = ({
    baseURL,
    clientId,
    apiKey,
    tenantDB,
    getAuthContext
}) => {

    const instance = axios.create({
        baseURL,
        timeout: 180000,
        headers: {
            "Content-Type": "application/json",
            clientId,
            apiKey
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    // ✅ REQUEST INTERCEPTOR (token + start time)
    instance.interceptors.request.use(async (config) => {
        config.metadata = { startTime: Date.now() };

        if (getAuthContext) {
            const auth = await getAuthContext();
            const token = await getValidAccessToken(auth);
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    });

    // ✅ RESPONSE INTERCEPTOR (SUCCESS)
    instance.interceptors.response.use(
        async (response) => {
            try {

                const { config } = response;
                const responseTime = Date.now() - (config?.metadata?.startTime || Date.now());
                const fullUrl = `${config?.baseURL || ""}${config?.url || ""}`;
                const isMiracleError = Boolean(response?.data?.IsError);
                const moduleName = inferModuleFromUrl(config?.url);

                // 1. Legacy API Log
                await insertApiLog({
                    company_id: config.company_id || null,
                    method: config.method?.toUpperCase(),
                    url: fullUrl,
                    status_code: response.status,
                    response_time: responseTime,
                    ip_address: null,
                    user_agent: "axios-client",
                    level: (response.status >= 400 || isMiracleError) ? "error" : "info",
                    error: isMiracleError ? JSON.stringify(response?.data).slice(0, 1000) : null,
                    tenentDb: tenantDB
                });

                // 2. High-Fidelity Miracle Log
                insertMiracleLog(tenantDB, {
                    log_type: "MIRACLE_OUTBOUND",
                    module_name: moduleName,
                    action_type: config.method?.toUpperCase() || "POST",
                    url: fullUrl,
                    method: config.method?.toUpperCase() || "POST",
                    status_code: response.status,
                    status: isMiracleError ? "FAILED" : "SUCCESS",
                    response_time: responseTime,
                    request_payload: config.data,
                    response_payload: response.data,
                    error_message: isMiracleError ? (response?.data?.Message || "Miracle API Error") : null,
                    company_masters_id: config.company_id || null,
                });

            } catch (err) {
                console.log("Axios success log error:", err);
            }

            return response;
        },

        // ✅ RESPONSE INTERCEPTOR (ERROR)
        async (error) => {
            try {
                const { config, response } = error;

                const responseTime =
                    Date.now() - (config?.metadata?.startTime || Date.now());
                const fullUrl = `${config?.baseURL || ""}${config?.url || ""}`;
                const moduleName = inferModuleFromUrl(config?.url);

                // 1. Legacy API Log
                await insertApiLog({
                    company_id: config?.company_id || null,
                    method: config?.method?.toUpperCase(),
                    url: fullUrl,
                    status_code: response?.status || 500,
                    response_time: responseTime,
                    ip_address: null,
                    user_agent: "axios-client",
                    level: "error",
                    error: JSON.stringify(response?.data || error.message).slice(0, 1000),
                    tenentDb: tenantDB
                });

                // 2. High-Fidelity Miracle Log
                insertMiracleLog(tenantDB, {
                    log_type: "MIRACLE_OUTBOUND",
                    module_name: moduleName,
                    action_type: config?.method?.toUpperCase() || "POST",
                    url: fullUrl,
                    method: config?.method?.toUpperCase() || "POST",
                    status_code: response?.status || 500,
                    status: "FAILED",
                    response_time: responseTime,
                    request_payload: config?.data,
                    response_payload: response?.data || null,
                    error_message: response?.data?.Message || error.message,
                    company_masters_id: config?.company_id || null,
                });

            } catch (err) {
                console.log("Axios error log failed:", err);
            }

            return Promise.reject(error);
        }
    );

    return instance;
};