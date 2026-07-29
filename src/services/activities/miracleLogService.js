import { Op } from "sequelize";
import { miracleLogModel } from "../../models/activities/miracleLogModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";

// Track which tenantDB instances have already synced the miracle_logs table
// so we don't call sync() on every single insert (performance)
const syncedDBs = new WeakSet();

const ensureTable = async (tenantDB) => {
    if (syncedDBs.has(tenantDB)) return;
    const model = miracleLogModel(tenantDB);
    // sync() with no options: creates table if not exists, does NOT drop or alter
    await model.sync();
    syncedDBs.add(tenantDB);
};

/**
 * Insert a miracle log entry (fire-and-forget safe).
 */
export const insertMiracleLog = async (tenantDB, data = {}) => {
    try {
        if (!tenantDB) return;
        await ensureTable(tenantDB);
        const model = miracleLogModel(tenantDB);
        await model.create({
            log_type: data.log_type || "CRM_API",
            module_name: data.module_name || "",
            record_id: data.record_id || null,
            action_type: data.action_type || "",
            miracle_unique_id: data.miracle_unique_id || "",
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
        });
    } catch (err) {
        // Silent — never let logging break the main flow
        console.error("[miracleLogService] insertMiracleLog error:", err.message);
    }
};

/**
 * Fetch paginated miracle logs with optional filters.
 */
export const getMiracleLogs = async (req) => {
    try {
        const {
            page = 1,
            page_size = 25,
            log_type,
            status,
            module_name,
            start_date,
            end_date,
            search,
        } = req.body;

        const tenantDB = req.tenantDB;
        if (!tenantDB) return resError({ ack_msg: "Tenant DB not found" });

        await ensureTable(tenantDB);
        const model = miracleLogModel(tenantDB);

        const where = {};

        if (log_type) where.log_type = log_type;
        if (status) where.status = status;
        if (module_name) {
            if (module_name === "invoice") {
                where[Op.or] = [
                    { module_name: { [Op.like]: "%invoice%" } },
                    { module_name: { [Op.like]: "%voucher%" } }
                ];
            } else if (module_name === "contact") {
                where[Op.or] = [
                    { module_name: { [Op.like]: "%contact%" } },
                    { module_name: { [Op.like]: "%account%" } }
                ];
            } else {
                where.module_name = { [Op.like]: `%${module_name}%` };
            }
        }

        // Date range filter
        if (start_date || end_date) {
            where.created_date_time = {};
            if (start_date) where.created_date_time[Op.gte] = new Date(start_date + "T00:00:00.000Z");
            if (end_date) where.created_date_time[Op.lte] = new Date(end_date + "T23:59:59.999Z");
        }

        // Search across url, module_name, error_message, miracle_unique_id
        if (search) {
            where[Op.or] = [
                { url: { [Op.like]: `%${search}%` } },
                { module_name: { [Op.like]: `%${search}%` } },
                { error_message: { [Op.like]: `%${search}%` } },
                { miracle_unique_id: { [Op.like]: `%${search}%` } },
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
            ack_msg: "Miracle logs fetched successfully",
            data: { count, rows },
        });
    } catch (err) {
        console.error("[miracleLogService] getMiracleLogs error:", err.message);
        return resError({ ack_msg: err.message });
    }
};

/**
 * Clear all miracle logs for this tenant.
 */
export const clearMiracleLogs = async (req) => {
    try {
        const tenantDB = req.tenantDB;
        if (!tenantDB) return resError({ ack_msg: "Tenant DB not found" });

        await ensureTable(tenantDB);
        const model = miracleLogModel(tenantDB);

        await model.destroy({ where: {}, truncate: true });

        return resSuccess({
            code: 200,
            ack_msg: "Miracle logs cleared successfully",
            data: [],
        });
    } catch (err) {
        console.error("[miracleLogService] clearMiracleLogs error:", err.message);
        return resError({ ack_msg: err.message });
    }
};
