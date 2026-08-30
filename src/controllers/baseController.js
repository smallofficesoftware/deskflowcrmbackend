import { requestContext } from "../config/context.js";
import emitToCompany from "../services/1socketIOServices/emitToCompany.js";
import { contactModel } from "../models/activities/contactModel.js";
import { taskManagementModel } from "../models/activities/taskManagementModel.js";
import maintenanceModesModel from "../models/configuration/maintenanceModesModel.js";

// Service functions that should broadcast a live-refresh signal to the rest
// of the company on success. Keyed by the FN_name each router already passes
// to callServiceMethod, mapped to the socket event listeners subscribe to.
// Values may be a single event name or an array of event names — task_managements
// rows double as support tickets (is_support_ticket flag), so any write on that
// table/FN_name needs to notify both the Task views and the Support Ticket list.
const SOCKET_EVENT_MAP = {
  createAllTask: "task-changed",
  AllTaskUpdate: ["task-changed", "support-ticket-changed"],
  AllTaskDelete: ["task-changed", "support-ticket-changed"],
  archiveAllTask: ["task-changed", "support-ticket-changed"],
  unarchiveAllTask: ["task-changed", "support-ticket-changed"],
  createContact: "contact-changed",
  updateContact: "contact-changed",
  deleteContact: "contact-changed",
  assignStatusContactsProvider: "contact-changed",
  assignLableContactsProvider: "contact-changed",
  assignContactsProvider: "contact-changed",
  createcreateCustomerSupportTicketAllTask: "support-ticket-changed",
  convertSupportTicketAllTask: ["task-changed", "support-ticket-changed"],
};

// The generic commonCreate/commonUpdate passthrough is shared by every
// entity, so its event is resolved by the `table` in the request body
// instead of FN_name — this is also what the Kanban board's drag-to-move
// writes go through, so a drag emits the same "task-changed" signal.
const COMMON_TABLE_EVENT_MAP = {
  task_managements: ["task-changed", "support-ticket-changed"],
  contact_masters: "contact-changed",
  task_message_histories: "task-chat-changed",
  contact_message_histories: "contact-chat-changed",
};

const resolveSocketEvents = (FN_name, req) => {
  let mapped;
  if (FN_name === "updateCommon" || FN_name === "createCommon") {
    mapped = COMMON_TABLE_EVENT_MAP[req.body?.table] || null;
  } else {
    mapped = SOCKET_EVENT_MAP[FN_name] || null;
  }
  if (!mapped) return [];
  return Array.isArray(mapped) ? mapped : [mapped];
};

// Best-effort attempt to find "which record does this event concern" so a
// listener already showing that one record (a chat window, a Kanban card)
// can skip refetching for changes to everything else in the company. Never
// throws and never blocks the emit - a payload that ends up empty just
// means every listener falls back to today's behavior (refetch anyway).
const safeJSONParse = (value) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};

const resolveSocketPayload = (FN_name, req, data) => {
  if (FN_name === "updateCommon" || FN_name === "createCommon") {
    const table = req.body?.table;
    if (table === "task_message_histories" || table === "contact_message_histories") {
      // Only a *new* message carries the parent task/contact id - edits,
      // deletes, and reminder-flag updates on an existing message only
      // touch the message's own id (in `where`), not its parent, so those
      // fall through to an unscoped broadcast rather than a wrong scope.
      const parsedData = safeJSONParse(req.body?.data) || {};
      if (table === "task_message_histories" && parsedData.task_id) {
        return { task_id: parsedData.task_id };
      }
      if (table === "contact_message_histories" && parsedData.contact_masters_id) {
        return { contact_id: parsedData.contact_masters_id };
      }
      return {};
    }
    if (table === "task_managements" || table === "contact_masters") {
      // A brand-new task/contact has nothing already open to match against,
      // so only scope updates to an existing row (`where: {"id": ...}`).
      if (FN_name === "updateCommon") {
        const parsedWhere = safeJSONParse(req.body?.where);
        if (parsedWhere?.id) return { id: parsedWhere.id };
      }
      return {};
    }
    return {};
  }

  // FN_name-keyed task/contact actions - each route uses its own field name
  // for the record id (verified against the actual service functions, not
  // guessed): AllTaskUpdate uses `editId`; AllTaskDelete/archiveAllTask/
  // unarchiveAllTask use `TaskId`; deleteContact uses `contactId`;
  // assignContactsProvider/assignStatusContactsProvider/
  // assignLableContactsProvider use `appliedTo` (single id, or the literal
  // string "all" for a filter-driven bulk apply). Several of these can be
  // an array/"all" for bulk actions - kept unscoped rather than guessing
  // how a listener should compare against a list.
  const rawId =
    req.body?.id ??
    req.body?.task_id ??
    req.body?.contact_id ??
    req.body?.editId ??
    req.body?.TaskId ??
    req.body?.contactId ??
    (req.body?.appliedTo !== "all" ? req.body?.appliedTo : undefined);
  const id = Array.isArray(rawId) ? undefined : rawId;
  return id ? { id } : {};
};

const emitSocketEventForResult = (req, eventName, payload) => {
  try {
    const io = req.app.get("io");
    const companyId = requestContext.getStore()?.companyId;
    emitToCompany(io, companyId, eventName, payload);
  } catch (error) {
    // Never let a broadcast failure affect the already-sent HTTP response.
    console.error(`[socket:${eventName}] emit failed`, error);
  }
};

// Same admin-panel kill-switch src/index.js's io.use() gate checks
// (maintenance_modes.is_socket_disabled) - when it's on, no client can even
// hold a socket connection, so every emit here is a guaranteed no-op. Skip
// the whole thing (including the attach*Assignees DB lookups) rather than
// doing that work for nobody on every single write. Fails open on a DB
// error, same as the connection-gate itself.
const isSocketDisabled = async () => {
  try {
    const setting = await maintenanceModesModel.findOne({ where: { isDelete: 0 } });
    return setting?.dataValues?.is_socket_disabled === 1;
  } catch (error) {
    console.error("[socket] failed to read maintenance_modes, assuming enabled", error);
    return false;
  }
};

// Contact Kanban board only wants to auto-refresh for contacts assigned to
// the viewer, not every contact-changed event company-wide (a company can
// have many team members' boards open at once, each only caring about
// their own assignments). Reading assinged_to_work_a_application_id
// straight off the row (not off req.body) works regardless of which
// entry point fired the event (createContact/updateContact/deleteContact/
// assignStatusContactsProvider/updateCommon all reach here with different
// body shapes) - one cheap lookup by the id already resolved into the
// payload, skipped entirely when there's no id (a brand-new contact keeps
// today's "always refresh, it might belong on this board" behavior).
const attachContactAssignees = async (req, eventName, payload) => {
  if (eventName !== "contact-changed" || !payload?.id || !req.tenantDB) {
    return payload;
  }
  try {
    const Contact = contactModel(req.tenantDB);
    const contact = await Contact.findOne({
      where: { id: payload.id },
      attributes: ["assinged_to_work_a_application_id"],
      raw: true,
    });
    const assignedIds = (contact?.assinged_to_work_a_application_id || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => !isNaN(v));
    return { ...payload, assigned_to: assignedIds };
  } catch (error) {
    console.error(`[socket:${eventName}] failed to resolve assignee`, error);
    return payload;
  }
};

// Same idea as attachContactAssignees, for the Task/Support Ticket Kanban
// board (task_managements rows double as support tickets, and both share
// the one TaskKanbanModal component listening on "task-changed" - no
// separate handling needed for support-ticket-changed). Covers every
// assign-team-member/assign-status/assign-label action since they all
// reach here via the same updateCommon(table: "task_managements") path.
const attachTaskAssignees = async (req, eventName, payload) => {
  if (eventName !== "task-changed" || !payload?.id || !req.tenantDB) {
    return payload;
  }
  try {
    const Task = taskManagementModel(req.tenantDB);
    const task = await Task.findOne({
      where: { id: payload.id },
      attributes: ["assigned_team_member"],
      raw: true,
    });
    const assignedIds = (task?.assigned_team_member || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => !isNaN(v));
    return { ...payload, assigned_to: assignedIds };
  } catch (error) {
    console.error(`[socket:${eventName}] failed to resolve assignee`, error);
    return payload;
  }
};

const callServiceMethod = async (req, res, serviceMethodToCall, FN_name) => {
  try {
    const data = await serviceMethodToCall;
    res.status(200).send(data);

    const eventNames = resolveSocketEvents(FN_name, req);
    if (eventNames.length && data?.ack === 1 && !(await isSocketDisabled())) {
      const payload = resolveSocketPayload(FN_name, req, data);
      for (const eventName of eventNames) {
        let enrichedPayload = await attachContactAssignees(req, eventName, payload);
        enrichedPayload = await attachTaskAssignees(req, eventName, enrichedPayload);
        emitSocketEventForResult(req, eventName, enrichedPayload);
      }
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      res.status(401).send({ message: 'Unauthorized: Token is invalid or expired' });
    } else {
      console.error(error);
      res.status(500).send({ message: 'Internal Server Error' });
    }
    console.error(error);
  }
};

export default callServiceMethod;



