import { requestContext } from "../config/context.js";
import emitToCompany from "../services/1socketIOServices/emitToCompany.js";

// Service functions that should broadcast a live-refresh signal to the rest
// of the company on success. Keyed by the FN_name each router already passes
// to callServiceMethod, mapped to the socket event listeners subscribe to.
const SOCKET_EVENT_MAP = {
  createAllTask: "task-changed",
  AllTaskUpdate: "task-changed",
  AllTaskDelete: "task-changed",
  archiveAllTask: "task-changed",
  unarchiveAllTask: "task-changed",
  createContact: "contact-changed",
  updateContact: "contact-changed",
  deleteContact: "contact-changed",
  assignStatusContactsProvider: "contact-changed",
};

// The generic commonCreate/commonUpdate passthrough is shared by every
// entity, so its event is resolved by the `table` in the request body
// instead of FN_name — this is also what the Kanban board's drag-to-move
// writes go through, so a drag emits the same "task-changed" signal.
const COMMON_TABLE_EVENT_MAP = {
  task_managements: "task-changed",
  contact_masters: "contact-changed",
};

const resolveSocketEvent = (FN_name, req) => {
  if (FN_name === "updateCommon" || FN_name === "createCommon") {
    return COMMON_TABLE_EVENT_MAP[req.body?.table] || null;
  }
  return SOCKET_EVENT_MAP[FN_name] || null;
};

const emitSocketEventForResult = (req, eventName) => {
  try {
    const io = req.app.get("io");
    const companyId = requestContext.getStore()?.companyId;
    emitToCompany(io, companyId, eventName);
  } catch (error) {
    // Never let a broadcast failure affect the already-sent HTTP response.
    console.error(`[socket:${eventName}] emit failed`, error);
  }
};

const callServiceMethod = async (req, res, serviceMethodToCall, FN_name) => {
  try {
    const data = await serviceMethodToCall;
    res.status(200).send(data);

    const eventName = resolveSocketEvent(FN_name, req);
    if (eventName && data?.ack === 1) {
      emitSocketEventForResult(req, eventName);
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



