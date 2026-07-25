import axios from 'axios';
import https from 'https';
import { getValidAccessToken } from '../middlewares/miracleTokenManager.js';
import { insertApiLog } from '../services/activities/logService.js';

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
                const responseTime = Date.now() - config.metadata.startTime;

                await insertApiLog({
                    company_id: config.company_id || null,
                    method: config.method?.toUpperCase(),
                    url: `${config.baseURL || ""}${config.url}`,
                    status_code: response.status,
                    response_time: responseTime,
                    ip_address: null,
                    user_agent: "axios-client",
                    level: response.status >= 400 ? "error" : "info",
                    error: null,
                    tenentDb: tenantDB // 👈 IMPORTANT
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

                await insertApiLog({
                    company_id: config?.company_id || null,
                    method: config?.method?.toUpperCase(),
                    url: `${config?.baseURL || ""}${config?.url || ""}`,
                    status_code: response?.status || 500,
                    response_time: responseTime,
                    ip_address: null,
                    user_agent: "axios-client",
                    level: "error",
                    error: JSON.stringify(response?.data || error.message).slice(0, 1000),
                    tenentDb: tenantDB // 👈 IMPORTANT
                });

            } catch (err) {
                console.log("Axios error log failed:", err);
            }

            return Promise.reject(error);
        }
    );

    return instance;
};