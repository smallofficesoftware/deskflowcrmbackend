import { requestContext } from "../config/context.js";
import emitToCompany from "../services/1socketIOServices/emitToCompany.js";

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
  // unarchiveAllTask use `TaskId`; deleteContact uses `contactId`. Several
  // of these can be an array for bulk actions - kept unscoped rather than
  // guessing how a listener should compare against a list.
  const rawId =
    req.body?.id ??
    req.body?.task_id ??
    req.body?.contact_id ??
    req.body?.editId ??
    req.body?.TaskId ??
    req.body?.contactId;
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

const callServiceMethod = async (req, res, serviceMethodToCall, FN_name) => {
  try {
    const data = await serviceMethodToCall;
    res.status(200).send(data);

    const eventNames = resolveSocketEvents(FN_name, req);
    if (eventNames.length && data?.ack === 1) {
      const payload = resolveSocketPayload(FN_name, req, data);
      eventNames.forEach((eventName) =>
        emitSocketEventForResult(req, eventName, payload),
      );
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



