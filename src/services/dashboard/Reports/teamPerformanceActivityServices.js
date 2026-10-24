import moment from "moment";
import { QueryTypes } from "sequelize";
import { getCompanyByLoginId } from "../../commonServices.js";
import { isValid, resBadRequest, resError, resSuccess } from "../../../utils/sharedFunctions.js";

// Call types in call_histories: 1 Incoming, 2 Outgoing, 3 Missed, 4 Rejected, 5 Blocked,
// 7 Outgoing Not Connected. Connected = a conversation happened; not connected = missed or the
// outgoing call did not connect. Rejected / blocked only count in the total.
const CONNECTED_CALL_TYPES = "1, 2";
const NOT_CONNECTED_CALL_TYPES = "3, 7";
const TASK_COMPLETE_STATUS = -6;
const DETAIL_ROW_LIMIT = 200;
const CONTACT_LIMIT = 5000;

export const emptyActivity = () => ({
    calls_total: 0,
    calls_connected: 0,
    calls_not_connected: 0,
    followups_done: 0,
    tasks_assigned: 0,
    tasks_completed: 0,
    tasks_pending: 0,
    tasks_with_contact: 0,
    tasks_called: 0,
});

const fmt = (d) => moment(d).format("YYYY-MM-DD HH:mm:ss");
const ids = (list) => [...new Set((list || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/**
 * Per team member activity for the Team Performance report columns, for one date range.
 *
 * - calls_*: calls the member made or took (call_histories).
 * - followups_done: reminders the member completed in the range.
 * - tasks_*: tasks created in the range and assigned to the member; tasks_called = how many of
 *   those tasks' contacts the member called after the task was created.
 *
 * Returns Map(userId -> counts). Users with nothing get zeros.
 */
export async function getTeamActivityCounts(tenantDB, userIds, startDate, endDate) {
    const result = new Map();
    const users = ids(userIds);
    users.forEach((id) => result.set(id, emptyActivity()));
    if (users.length === 0 || !moment(startDate).isValid() || !moment(endDate).isValid()) return result;

    const replacements = { users, start: fmt(startDate), end: fmt(endDate) };
    const select = (sql) => tenantDB.query(sql, { replacements, type: QueryTypes.SELECT });

    const [calls, reminders, tasks] = await Promise.all([
        select(
            `SELECT a_application_login_id AS uid, COUNT(*) AS total,
                    SUM(call_type IN (${CONNECTED_CALL_TYPES})) AS connected,
                    SUM(call_type IN (${NOT_CONNECTED_CALL_TYPES})) AS not_connected
             FROM call_histories
             WHERE isDelete = 0 AND a_application_login_id IN (:users)
               AND call_date_time BETWEEN :start AND :end
             GROUP BY a_application_login_id`
        ),
        select(
            `SELECT assigned_to AS uid, COUNT(*) AS done
             FROM reminder_messages
             WHERE isDelete = 0 AND status = 1 AND is_reminder_app_flag = 0
               AND assigned_to IN (:users)
               AND completed_date_time BETWEEN :start AND :end
             GROUP BY assigned_to`
        ),
        select(
            `SELECT u.id AS uid,
                    COUNT(t.id) AS assigned,
                    SUM(t.status = ${TASK_COMPLETE_STATUS}) AS completed,
                    SUM(t.status <> ${TASK_COMPLETE_STATUS}) AS pending,
                    SUM(t.contact_masters_id > 0) AS with_contact,
                    SUM(t.contact_masters_id > 0 AND EXISTS (
                        SELECT 1 FROM call_histories ch
                        WHERE ch.isDelete = 0 AND ch.a_application_login_id = u.id
                          AND ch.contact_id = t.contact_masters_id
                          AND ch.call_date_time >= t.created_date_time
                    )) AS called
             FROM (${users.map((id) => `SELECT ${id} AS id`).join(" UNION ALL ")}) u
             LEFT JOIN task_managements t
                    ON FIND_IN_SET(u.id, t.assigned_team_member)
                   AND t.isDelete = 0 AND t.is_archive = '0' AND t.task_template = '0'
                   AND t.is_not_visible = '0' AND t.is_support_ticket = '0'
                   AND t.created_date_time BETWEEN :start AND :end
             GROUP BY u.id`
        ),
    ]);

    calls.forEach((r) => {
        const a = result.get(Number(r.uid));
        if (!a) return;
        a.calls_total = Number(r.total) || 0;
        a.calls_connected = Number(r.connected) || 0;
        a.calls_not_connected = Number(r.not_connected) || 0;
    });
    reminders.forEach((r) => {
        const a = result.get(Number(r.uid));
        if (a) a.followups_done = Number(r.done) || 0;
    });
    tasks.forEach((r) => {
        const a = result.get(Number(r.uid));
        if (!a) return;
        a.tasks_assigned = Number(r.assigned) || 0;
        a.tasks_completed = Number(r.completed) || 0;
        a.tasks_pending = Number(r.pending) || 0;
        a.tasks_with_contact = Number(r.with_contact) || 0;
        a.tasks_called = Number(r.called) || 0;
    });
    return result;
}

const tally = (map) =>
    [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/**
 * Details popup for one team member in the Team Performance report: which of the tasks given in
 * the range had a call made, and the contacts the member worked on (called, completed a reminder
 * for, or was given a task about) counted by their current status and by label.
 *
 * Body: { a_application_login_id, user_id, selectedDates: [from, to] }
 */
export const getTeamPerformanceDetail = async (req) => {
    try {
        const { a_application_login_id, user_id, selectedDates } = req.body;
        const userId = Number(user_id);
        if (!Number.isInteger(userId) || userId <= 0 || !Array.isArray(selectedDates) || selectedDates.length !== 2) {
            return resError({ ack_msg: "Invalid request", developer_msg: "user_id and selectedDates are required" });
        }
        const start = moment(selectedDates[0]).startOf("day");
        const end = moment(selectedDates[1]).endOf("day");
        if (!start.isValid() || !end.isValid()) {
            return resError({ ack_msg: "Invalid date range", developer_msg: "selectedDates must be dates" });
        }
        // Make sure the caller belongs to a company (same guard the report itself uses).
        await getCompanyByLoginId(a_application_login_id);

        const replacements = { userId, start: fmt(start), end: fmt(end), limit: DETAIL_ROW_LIMIT };
        const select = (sql, extra = {}) => req.tenantDB.query(sql, { replacements: { ...replacements, ...extra }, type: QueryTypes.SELECT });

        const tasks = await select(
            `SELECT t.id, t.task_title, t.status, t.contact_masters_id,
                    DATE_FORMAT(t.created_date_time, '%d-%m-%Y') AS given_on,
                    c.person_name, c.mobile_number,
                    (SELECT MAX(ch.call_date_time) FROM call_histories ch
                      WHERE ch.isDelete = 0 AND ch.a_application_login_id = :userId
                        AND ch.contact_id = t.contact_masters_id
                        AND ch.call_date_time >= t.created_date_time) AS last_call
             FROM task_managements t
             LEFT JOIN contact_masters c ON c.id = t.contact_masters_id
             WHERE t.isDelete = 0 AND t.is_archive = '0' AND t.task_template = '0'
               AND t.is_not_visible = '0' AND t.is_support_ticket = '0'
               AND FIND_IN_SET(:userId, t.assigned_team_member)
               AND t.created_date_time BETWEEN :start AND :end
             ORDER BY t.created_date_time DESC
             LIMIT :limit`
        );

        const touched = await Promise.all([
            select(`SELECT DISTINCT contact_id AS id FROM call_histories WHERE isDelete = 0 AND a_application_login_id = :userId AND call_date_time BETWEEN :start AND :end AND contact_id > 0 LIMIT ${CONTACT_LIMIT}`),
            select(`SELECT DISTINCT contact_masters_id AS id FROM reminder_messages WHERE isDelete = 0 AND status = 1 AND assigned_to = :userId AND completed_date_time BETWEEN :start AND :end AND contact_masters_id > 0 LIMIT ${CONTACT_LIMIT}`),
            select(`SELECT DISTINCT contact_masters_id AS id FROM task_managements WHERE isDelete = 0 AND FIND_IN_SET(:userId, assigned_team_member) AND created_date_time BETWEEN :start AND :end AND contact_masters_id > 0 LIMIT ${CONTACT_LIMIT}`),
        ]);
        const contactIds = ids(touched.flat().map((r) => r.id));

        const statusCount = new Map();
        const labelCount = new Map();
        if (contactIds.length > 0) {
            const contacts = await req.tenantDB.query(
                `SELECT c.id, c.lable, s.name AS status_name
                 FROM contact_masters c
                 LEFT JOIN stage_status_masters s ON s.id = c.contact_status
                 WHERE c.isDelete = 0 AND c.id IN (:contactIds)`,
                { replacements: { contactIds }, type: QueryTypes.SELECT }
            );
            const labels = await req.tenantDB.query(`SELECT id, lable_name FROM lable_masters WHERE isDelete = 0`, { type: QueryTypes.SELECT });
            const labelName = new Map(labels.map((l) => [String(l.id), l.lable_name]));

            contacts.forEach((c) => {
                const status = isValid(c.status_name) ? c.status_name : "No status";
                statusCount.set(status, (statusCount.get(status) || 0) + 1);
                const own = String(c.lable || "").split(",").map((v) => v.trim()).filter(Boolean);
                if (own.length === 0) labelCount.set("No label", (labelCount.get("No label") || 0) + 1);
                own.forEach((id) => {
                    const name = labelName.get(id) || `Label ${id}`;
                    labelCount.set(name, (labelCount.get(name) || 0) + 1);
                });
            });
        }

        return resSuccess({
            data: {
                contacts_touched: contactIds.length,
                status_breakdown: tally(statusCount),
                label_breakdown: tally(labelCount),
                tasks: tasks.map((t) => ({
                    id: t.id,
                    title: t.task_title || "",
                    given_on: t.given_on || "",
                    completed: Number(t.status) === TASK_COMPLETE_STATUS,
                    contact_name: t.person_name || "",
                    mobile_number: t.mobile_number || "",
                    has_contact: Number(t.contact_masters_id) > 0,
                    called: !!t.last_call,
                    last_call: t.last_call ? moment(t.last_call).format("DD-MM-YYYY hh:mm A") : "",
                })),
            },
        });
    } catch (error) {
        console.log("getTeamPerformanceDetail Error", error);
        return resBadRequest({ ack_msg: "Something went wrong", developer_msg: `Error: ${error.message}` });
    }
};
