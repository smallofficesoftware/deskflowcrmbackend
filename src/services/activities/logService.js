import { apiLogsModel } from '../../models/activities/apiLogsModel.js';

export const insertApiLog = async ({
    company_id = "",
    a_application_login_id = "",
    method,
    url,
    status_code,
    response_time,
    ip_address,
    user_agent,
    level = 'info',
    requestBody = null,
    error = null,
    tenentDb
}) => {
    try {
        if (!tenentDb) return;

        const apiLogsModelInstance = apiLogsModel(tenentDb);

        await apiLogsModelInstance.create({
            company_masters_id: company_id || 0,
            a_application_login_id: a_application_login_id || 0,
            method,
            url,
            status_code,
            response_time,
            ip_address: ip_address || "",
            user_agent: user_agent || "",
            level,
            error: error || "",
            requestBody: requestBody || "",
        });

    } catch (err) {
        console.error('Log insert error:', err.message);
    }
};