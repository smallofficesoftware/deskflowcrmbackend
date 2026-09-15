import { Op } from "sequelize";
import { thirdPartyLogModel } from "../../models/activities/thirdPartyLogModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";

// Track which tenantDB instances have already synced the third_party_logs
// table so we don't call sync() on every single insert (performance) - same
// pattern as miracleLogService.js.
const syncedDBs = new WeakSet();

const ensureTable = async (tenantDB) => {
    if (syncedDBs.has(tenantDB)) return;
    const model = thirdPartyLogModel(tenantDB);
    // sync() with no options: creates table if not exists, does NOT drop or alter
    await model.sync();
    syncedDBs.add(tenantDB);
};

/**
 * Insert a third-party integration log entry (fire-and-forget safe).
 */
export const insertThirdPartyLog = async (tenantDB, data = {}) => {
    try {
        if (!tenantDB) return;
        await ensureTable(tenantDB);
        const model = thirdPartyLogModel(tenantDB);
        await model.create({
            integration: data.integration || "",
            direction: data.direction || "OUTBOUND",
            module_name: data.module_name || "",
            url: data.url || "",
            method: data.method || "POST",
            status_code: data.status_code || null,
            status: data.status || "SUCCESS",
            response_time: data.response_time || null,
            request_payload: data.request_payload
                ? (typeof data.request_payload === "string"
                    ? data.request_payload
                    : JSON.stringify(data.request_payload))
                : null,
            response_payload: data.response_payload
                ? (typeof data.response_payload === "string"
                    ? data.response_payload
                    : JSON.stringify(data.response_payload))
                : null,
            error_message: data.error_message
                ? (typeof data.error_message === "string"
                    ? data.error_message
                    : JSON.stringify(data.error_message))
                : null,
            company_masters_id: data.company_masters_id || null,
            a_application_login_id: data.a_application_login_id || null,
        });
    } catch (err) {
        // Silent — never let logging break the main flow
        console.error("[thirdPartyLogService] insertThirdPartyLog error:", err.message);
    }
};

/**
 * Fetch paginated third-party logs with optional filters.
 */
export const getThirdPartyLogs = async (req) => {
    try {
        const {
            page = 1,
            page_size = 25,
            integration,
            direction,
            status,
            start_date,
            end_date,
            search,
        } = req.body;

        const tenantDB = req.tenantDB;
        if (!tenantDB) return resError({ ack_msg: "Tenant DB not found" });

        await ensureTable(tenantDB);
        const model = thirdPartyLogModel(tenantDB);

        const where = {};

        if (integration) where.integration = integration;
        if (direction) where.direction = direction;
        if (status) where.status = status;

        // Date range filter
        if (start_date || end_date) {
            where.created_date_time = {};
            if (start_date) where.created_date_time[Op.gte] = new Date(start_date + "T00:00:00.000Z");
            if (end_date) where.created_date_time[Op.lte] = new Date(end_date + "T23:59:59.999Z");
        }

        // Search across url, module_name, error_message
        if (search) {
            where[Op.or] = [
                { url: { [Op.like]: `%${search}%` } },
                { module_name: { [Op.like]: `%${search}%` } },
                { error_message: { [Op.like]: `%${search}%` } },
            ];
        }

        const offset = (Number(page) - 1) * Number(page_size);

        const { count, rows } = await model.findAndCountAll({
            where,
            order: [["created_date_time", "DESC"]],
            limit: Number(page_size),
            offset,
        });

        return resSuccess({
            code: 200,
            ack_msg: "Third-party logs fetched successfully",
            data: { count, rows },
        });
    } catch (err) {
        console.error("[thirdPartyLogService] getThirdPartyLogs error:", err.message);
        return resError({ ack_msg: err.message });
    }
};

/**
 * Clear all third-party logs for this tenant.
 */
export const clearThirdPartyLogs = async (req) => {
    try {
        const tenantDB = req.tenantDB;
        if (!tenantDB) return resError({ ack_msg: "Tenant DB not found" });

        await ensureTable(tenantDB);
        const model = thirdPartyLogModel(tenantDB);

        await model.destroy({ where: {}, truncate: true });

        return resSuccess({
            code: 200,
            ack_msg: "Third-party logs cleared successfully",
            data: [],
        });
    } catch (err) {
        console.error("[thirdPartyLogService] clearThirdPartyLogs error:", err.message);
        return resError({ ack_msg: err.message });
    }
};
