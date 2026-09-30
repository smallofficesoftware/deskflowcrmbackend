// Recurring forms (plan item Q1/Q2) — the database side. The rules (which days
// are due, what counts as missed) live in formBuilderSchedule.js.
//
//   schedules/list    schedules of one form               (manage_schedules)
//   schedules/save    create / change a schedule           (manage_schedules)
//   schedules/delete  remove a schedule                    (manage_schedules)
//   schedules/due     MY forms due today + still open      (any user)
//   schedules/report  done / missed per person and date    (manage_schedules sees all, others only their own)
//
// Entries are created on demand (see generateEntries), so no nightly job.
import { QueryTypes } from "sequelize";
import moment from "moment";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { formBuilderScheduleModel } from "../../models/form_builder/formBuilderScheduleModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { hasFormPermission } from "./formBuilderPermissions.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { catchUpRange, dueDates, entryState, isValidDateString, parseScheduleInput, parseWeekdays, serializeWeekdays } from "./formBuilderSchedule.js";

const todayIst = () => moment().utcOffset("+05:30").format("YYYY-MM-DD");

function parseAssignees(text) {
  try {
    const list = JSON.parse(text || "[]");
    return Array.isArray(list) ? list.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

async function loadContext(req, { needForm = true } = {}) {
  const loginId = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(loginId);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  const ctx = { loginId, company_masters_id: company.company_masters_id, tenantDB: req.tenantDB };
  if (!needForm) return ctx;

  const formId = Number(req.body?.form_id || req.body?.formId);
  if (!Number.isInteger(formId) || formId <= 0) return { error: resError({ ack_msg: "Choose a form" }) };
  const form = await formBuilderFormModel(req.tenantDB).findOne({ where: { id: formId, company_masters_id: ctx.company_masters_id, isDelete: 0 } });
  if (!form) return { error: resError({ ack_msg: "Form not found" }) };
  ctx.form = form;
  ctx.canManage = await hasFormPermission({ form, permissionKey: "manage_schedules", loginId, company_masters_id: ctx.company_masters_id, tenantDB: req.tenantDB });
  return ctx;
}

// Creates the entries that are due but not created yet — for every schedule
// of the company (or one form). Safe to run any number of times at once: the
// unique key on (schedule, day, person) turns a repeat into a no-op.
export async function generateEntries({ tenantDB, company_masters_id, formId = null, today = todayIst() }) {
  const Schedule = formBuilderScheduleModel(tenantDB);
  const where = { company_masters_id, isDelete: 0, isActive: 1 };
  if (formId) where.form_id = formId;
  const schedules = await Schedule.findAll({ where, raw: true });

  for (const row of schedules) {
    const schedule = { ...row, weekdays: parseWeekdays(row.weekdays) };
    const range = catchUpRange(schedule, today);
    if (!range) continue;
    const days = dueDates(schedule, range.from, range.to);
    const assignees = parseAssignees(row.assignee_login_ids);
    if (days.length && assignees.length) {
      const values = [];
      const replacements = { company_masters_id, schedule_id: row.id, form_id: row.form_id };
      let n = 0;
      for (const day of days) {
        for (const loginId of assignees) {
          values.push(`(:company_masters_id, :schedule_id, :form_id, :d${n}, :u${n})`);
          replacements[`d${n}`] = day;
          replacements[`u${n}`] = loginId;
          n += 1;
        }
      }
      await tenantDB.query(
        `INSERT IGNORE INTO form_builder_schedule_entries (company_masters_id, schedule_id, form_id, due_date, a_application_login_id) VALUES ${values.join(", ")}`,
        { replacements, type: QueryTypes.INSERT },
      );
    }
    await Schedule.update({ last_generated_date: range.to }, { where: { id: row.id } });
  }
}

// After a person saves an entry of a scheduled form: mark their due entry as
// filled. Uses the entry they came from, else today's entry for this form.
// Never blocks the save (the caller ignores failures).
export async function linkScheduleEntry({ tenantDB, company_masters_id, form_id, loginId, submissionId, entryId = null }) {
  const today = todayIst();
  await generateEntries({ tenantDB, company_masters_id, formId: form_id, today });
  const base = `UPDATE form_builder_schedule_entries SET submission_id = :submissionId, filled_at = NOW()
     WHERE company_masters_id = :company_masters_id AND form_id = :form_id AND a_application_login_id = :loginId AND submission_id IS NULL`;
  const replacements = { submissionId, company_masters_id, form_id, loginId };
  if (entryId) {
    await tenantDB.query(`${base} AND id = :entryId`, { replacements: { ...replacements, entryId: Number(entryId) }, type: QueryTypes.UPDATE });
  } else {
    await tenantDB.query(`${base} AND due_date = :today LIMIT 1`, { replacements: { ...replacements, today }, type: QueryTypes.UPDATE });
  }
}

const shapeSchedule = (row) => ({
  id: row.id,
  form_id: row.form_id,
  title: row.title,
  frequency: row.frequency,
  weekdays: parseWeekdays(row.weekdays),
  day_of_month: row.day_of_month,
  assignee_login_ids: parseAssignees(row.assignee_login_ids),
  start_date: row.start_date,
  end_date: row.end_date,
  isActive: row.isActive,
});

export const listSchedules = async (req) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.error) return ctx.error;
    if (!ctx.canManage) return resError({ code: 403, ack_msg: "You don't have the right to manage schedules for this form" });
    const rows = await formBuilderScheduleModel(ctx.tenantDB).findAll({
      where: { form_id: ctx.form.id, company_masters_id: ctx.company_masters_id, isDelete: 0 },
      order: [["id", "ASC"]],
      raw: true,
    });
    return resSuccess({ data: { items: rows.map(shapeSchedule) } });
  } catch (e) {
    console.error("listSchedules error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const saveSchedule = async (req) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.error) return ctx.error;
    if (!ctx.canManage) return resError({ code: 403, ack_msg: "You don't have the right to manage schedules for this form" });
    if (!ctx.form.published_schema_json) return resError({ ack_msg: "Publish the form first — people can only be asked to fill a published form" });

    const parsed = parseScheduleInput(req.body);
    if (parsed.error) return resError({ ack_msg: parsed.error });
    const v = parsed.value;
    const Schedule = formBuilderScheduleModel(ctx.tenantDB);
    const fields = {
      title: v.title,
      frequency: v.frequency,
      weekdays: serializeWeekdays(v.weekdays),
      day_of_month: v.day_of_month,
      assignee_login_ids: JSON.stringify(v.assignee_login_ids),
      start_date: v.start_date,
      end_date: v.end_date,
      isActive: req.body?.isActive === 0 || req.body?.isActive === false ? 0 : 1,
    };

    if (req.body?.id) {
      const existing = await Schedule.findOne({ where: { id: req.body.id, form_id: ctx.form.id, company_masters_id: ctx.company_masters_id, isDelete: 0 } });
      if (!existing) return resError({ ack_msg: "Schedule not found" });
      // A moved start date or a different day pattern only affects days from now on; entries already created stay.
      await existing.update(fields);
      return resSuccess({ ack_msg: "Schedule saved", data: { item: { id: existing.id } } });
    }
    const created = await Schedule.create({
      ...fields,
      company_masters_id: ctx.company_masters_id,
      form_id: ctx.form.id,
      created_by_a_application_login_id: ctx.loginId,
      created_date_time: new Date(),
      isDelete: 0,
    });
    return resSuccess({ ack_msg: "Schedule saved", data: { item: { id: created.id } } });
  } catch (e) {
    console.error("saveSchedule error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteSchedule = async (req) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.error) return ctx.error;
    if (!ctx.canManage) return resError({ code: 403, ack_msg: "You don't have the right to manage schedules for this form" });
    const [count] = await formBuilderScheduleModel(ctx.tenantDB).update(
      { isDelete: 1, isActive: 0 },
      { where: { id: req.body?.id, form_id: ctx.form.id, company_masters_id: ctx.company_masters_id, isDelete: 0 } },
    );
    if (!count) return resError({ ack_msg: "Schedule not found" });
    return resSuccess({ ack_msg: "Schedule removed" });
  } catch (e) {
    console.error("deleteSchedule error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// "Forms due today": this person's open entries — today's and any earlier day
// they still have not filled (shown as late), newest form first. Only forms
// the person can still open are listed.
export const listMyDueForms = async (req) => {
  try {
    const ctx = await loadContext(req, { needForm: false });
    if (ctx.error) return ctx.error;
    const today = todayIst();
    await generateEntries({ tenantDB: ctx.tenantDB, company_masters_id: ctx.company_masters_id, today });

    const rows = await ctx.tenantDB.query(
      `SELECT e.id, e.form_id, DATE_FORMAT(e.due_date, '%Y-%m-%d') AS due_date, e.submission_id, f.title AS form_title, s.title AS schedule_title
         FROM form_builder_schedule_entries e
         JOIN form_builder_forms f ON f.id = e.form_id AND f.isDelete = 0 AND f.published_schema_json IS NOT NULL
         JOIN form_builder_schedules s ON s.id = e.schedule_id AND s.isDelete = 0 AND s.isActive = 1
        WHERE e.company_masters_id = :company_masters_id AND e.a_application_login_id = :loginId
          AND e.submission_id IS NULL AND e.due_date <= :today
        ORDER BY e.due_date ASC, e.id ASC
        LIMIT 200`,
      { replacements: { company_masters_id: ctx.company_masters_id, loginId: ctx.loginId, today }, type: QueryTypes.SELECT },
    );
    const items = rows.map((r) => ({ ...r, state: entryState(r, today) }));
    return resSuccess({ data: { today, items, due_today: items.filter((i) => i.state === "due").length, late: items.filter((i) => i.state === "missed").length } });
  } catch (e) {
    console.error("listMyDueForms error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Who filled and who missed, per person and date, for one form.
export const scheduleReport = async (req) => {
  try {
    const ctx = await loadContext(req);
    if (ctx.error) return ctx.error;
    const access = await resolveFormAccess({ form: ctx.form, company_masters_id: ctx.company_masters_id, a_application_login_id: ctx.loginId, tenantDB: ctx.tenantDB });
    if (!ctx.canManage && !access.canFill) return resError({ code: 403, ack_msg: "No access to this form" });

    const today = todayIst();
    await generateEntries({ tenantDB: ctx.tenantDB, company_masters_id: ctx.company_masters_id, formId: ctx.form.id, today });

    let from = req.body?.from_date;
    let to = req.body?.to_date;
    if (!isValidDateString(to)) to = today;
    if (!isValidDateString(from)) from = moment(to).subtract(30, "days").format("YYYY-MM-DD");
    if (from > to) return resError({ ack_msg: "The from date can't be after the to date" });

    const replacements = { company_masters_id: ctx.company_masters_id, form_id: ctx.form.id, from, to: to < today ? to : today };
    let userFilter = "";
    if (!ctx.canManage) {
      userFilter = " AND e.a_application_login_id = :loginId";
      replacements.loginId = ctx.loginId;
    } else if (Number(req.body?.login_id) > 0) {
      userFilter = " AND e.a_application_login_id = :loginId";
      replacements.loginId = Number(req.body.login_id);
    }
    const rows = await ctx.tenantDB.query(
      `SELECT e.id, e.schedule_id, DATE_FORMAT(e.due_date, '%Y-%m-%d') AS due_date, e.a_application_login_id, e.submission_id
         FROM form_builder_schedule_entries e
        WHERE e.company_masters_id = :company_masters_id AND e.form_id = :form_id AND e.due_date BETWEEN :from AND :to${userFilter}
        ORDER BY e.due_date DESC, e.id DESC
        LIMIT 2000`,
      { replacements, type: QueryTypes.SELECT },
    );

    const ids = [...new Set(rows.map((r) => r.a_application_login_id))];
    const users = ids.length ? await loginModel.findAll({ where: { id: ids }, attributes: ["id", "username"], raw: true }) : [];
    const names = new Map(users.map((u) => [u.id, u.username]));
    const items = rows.map((r) => ({ ...r, user_name: names.get(r.a_application_login_id) || `User ${r.a_application_login_id}`, state: entryState(r, today) }));

    const perUser = new Map();
    for (const it of items) {
      const p = perUser.get(it.a_application_login_id) || { a_application_login_id: it.a_application_login_id, user_name: it.user_name, done: 0, missed: 0, due: 0 };
      p[it.state] += 1;
      perUser.set(it.a_application_login_id, p);
    }
    return resSuccess({ data: { from, to, today, items, summary: [...perUser.values()] } });
  } catch (e) {
    console.error("scheduleReport error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
