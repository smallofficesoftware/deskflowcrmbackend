import moment from "moment";
import { QueryTypes } from "sequelize";
import { isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const TODAY_LIMIT = 200;
const OVERDUE_LIMIT = 50; // the most recent overdue items; the true total is returned in counts
const PRIORITY_LABEL = { 1: "Low", 2: "Medium", 3: "High", 4: "Critical" };

const contactOf = (r) => ({
    contact_id: r.contact_masters_id || null,
    contact_name: r.person_name || "",
    company_name: r.company_name || "",
    mobile_number: r.mobile_number || "",
});

/**
 * "My day": what the logged-in user has to do today. Pending tasks assigned to the user and the
 * user's pending reminders, split into what is due today and what is already overdue, each with
 * the contact it is about. Items without a due date are left out.
 *
 * Body: { a_application_login_id, date? (YYYY-MM-DD, default today) }
 * Returns { date, tasks: { today, overdue }, reminders: { today, overdue }, counts }.
 * `overdue` holds the most recent overdue items only; `counts` has the true totals.
 */
export const getMyDaySummary = async (req) => {
    try {
        const { a_application_login_id, date } = req.body;
        const userId = Number(a_application_login_id);
        if (!Number.isInteger(userId) || userId <= 0) {
            return resError({ ack_msg: "Invalid user", developer_msg: "a_application_login_id is required" });
        }

        const day = isValid(date) && moment(date, "YYYY-MM-DD", true).isValid() ? date : moment().format("YYYY-MM-DD");
        const replacements = { userId, dayStart: `${day} 00:00:00`, dayEnd: `${day} 23:59:59` };
        const select = (sql, extra = {}) => req.tenantDB.query(sql, { replacements: { ...replacements, ...extra }, type: QueryTypes.SELECT });

        const taskBase = `
            FROM task_managements t
            LEFT JOIN contact_masters c ON c.id = t.contact_masters_id
            WHERE t.isDelete = 0 AND t.is_archive = '0' AND t.task_template = '0'
              AND t.is_not_visible = '0' AND t.is_support_ticket = '0'
              AND t.status <> -6
              AND FIND_IN_SET(:userId, t.assigned_team_member)
              AND t.task_enddate > '1000-01-01 00:00:00'`;
        const taskCols = `t.id, t.task_title, t.task_remark, t.task_priority,
              DATE_FORMAT(t.task_enddate, '%d-%m-%Y %h:%i %p') AS due,
              t.contact_masters_id, c.person_name, c.company_name, c.mobile_number`;

        const reminderBase = `
            FROM reminder_messages r
            LEFT JOIN contact_masters c ON c.id = r.contact_masters_id
            WHERE r.isDelete = 0 AND r.status = 0 AND r.is_reminder_app_flag = 0
              AND r.assigned_to = :userId
              AND r.reminder_data_time > '1000-01-01 00:00:00'`;
        const reminderCols = `r.id, r.remark, r.task_id,
              DATE_FORMAT(r.reminder_data_time, '%d-%m-%Y %h:%i %p') AS due,
              r.contact_masters_id, c.person_name, c.company_name, c.mobile_number`;

        const [tasksToday, tasksOverdue, [taskOverdueCount], remindersToday, remindersOverdue, [reminderOverdueCount]] = await Promise.all([
            select(`SELECT ${taskCols} ${taskBase} AND t.task_enddate BETWEEN :dayStart AND :dayEnd ORDER BY t.task_enddate ASC LIMIT ${TODAY_LIMIT}`),
            select(`SELECT ${taskCols} ${taskBase} AND t.task_enddate < :dayStart ORDER BY t.task_enddate DESC LIMIT ${OVERDUE_LIMIT}`),
            select(`SELECT COUNT(*) AS c ${taskBase} AND t.task_enddate < :dayStart`),
            select(`SELECT ${reminderCols} ${reminderBase} AND r.reminder_data_time BETWEEN :dayStart AND :dayEnd ORDER BY r.reminder_data_time ASC LIMIT ${TODAY_LIMIT}`),
            select(`SELECT ${reminderCols} ${reminderBase} AND r.reminder_data_time < :dayStart ORDER BY r.reminder_data_time DESC LIMIT ${OVERDUE_LIMIT}`),
            select(`SELECT COUNT(*) AS c ${reminderBase} AND r.reminder_data_time < :dayStart`),
        ]);

        const toTask = (r) => ({
            id: r.id,
            title: r.task_title || "",
            remark: r.task_remark || "",
            priority: PRIORITY_LABEL[r.task_priority] || "",
            due: r.due || "",
            ...contactOf(r),
        });
        const toReminder = (r) => ({
            id: r.id,
            remark: r.remark || "",
            task_id: r.task_id || null,
            due: r.due || "",
            ...contactOf(r),
        });

        return resSuccess({
            data: {
                date: day,
                tasks: { today: tasksToday.map(toTask), overdue: tasksOverdue.map(toTask) },
                reminders: { today: remindersToday.map(toReminder), overdue: remindersOverdue.map(toReminder) },
                counts: {
                    tasks_today: tasksToday.length,
                    tasks_overdue: Number(taskOverdueCount?.c) || 0,
                    reminders_today: remindersToday.length,
                    reminders_overdue: Number(reminderOverdueCount?.c) || 0,
                },
            },
        });
    } catch (error) {
        console.log("getMyDaySummary Error", error);
        return resBadRequest({ ack_msg: "Something went wrong", developer_msg: `Error: ${error.message}` });
    }
};
