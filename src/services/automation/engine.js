import moment from "moment";
import { Op } from "sequelize";
import { automationModels } from "../../models/automation/automationModels.js";
import { AUTO_PAUSE_AFTER_FAILURES, MAX_NODES_PER_RUN } from "./constants.js";
import { redact, safeJsonParse } from "./context.js";
import { clearFlowCache, loadFlowForRun } from "./flowStore.js";
import { canStartRun, getSettings, incrementUsage, isMaintenanceOn } from "./limits.js";
import { NODE_HANDLERS } from "./nodes/index.js";
import { notifyFlowFailure } from "./notify.js";
import { contactIdOf, fetchRowById, fetchUser, firstUserId, publicUser } from "./records.js";
import { logError, runInTenantContext } from "./runtime.js";
import { ASSIGN_FIELD } from "./constants.js";
import { nextBusinessMoment } from "./time.js";

// Runs a flow: trigger node -> wires -> nodes. One automation_executions row
// per run; one automation_execution_logs row per node. Waits persist the
// queue in the execution context and the scheduler resumes them.

const truncate = (value, max = 20000) => {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return s.length > max ? `${s.slice(0, max)}...[truncated]` : s;
};

const nextNodes = (flow, nodeId, handle) =>
  (flow.connections || [])
    .filter((c) => c.source === nodeId && (c.sourceHandle || "src") === handle)
    .map((c) => c.target);

const hasHandle = (flow, nodeId, handle) =>
  (flow.connections || []).some((c) => c.source === nodeId && (c.sourceHandle || "src") === handle);

const findTriggerNode = (flow) => (flow.nodes || []).find((n) => n.type === "trigger");

/** Context every run starts with: trigger data + contact + users. */
const buildInitialContext = async (tenantDB, flow, company_masters_id, triggerCtx) => {
  const ctx = {
    ...triggerCtx,
    company_masters_id,
    flow: { id: flow.id, name: flow.name },
    now: moment().format("YYYY-MM-DD HH:mm:ss"),
    today: moment().format("YYYY-MM-DD"),
    vars: {},
    steps: {},
    last: null,
    error: null,
  };
  try {
    const contactId = contactIdOf(triggerCtx.record_type, triggerCtx.record);
    if (contactId) {
      ctx.contact =
        triggerCtx.record_type === "contact" ? triggerCtx.record : await fetchRowById(tenantDB, "contact_masters", contactId);
    }
    const assignField = ASSIGN_FIELD[triggerCtx.record_type];
    const assignedId =
      firstUserId(assignField ? triggerCtx.record?.[assignField] : null) ||
      firstUserId(ctx.contact?.assinged_to_work_a_application_id) ||
      firstUserId(triggerCtx.record?.a_application_login_id);
    ctx.assigned_user = publicUser(await fetchUser(assignedId));
    ctx.run_as = publicUser(await fetchUser(flow.run_as_user_id || flow.created_by));
  } catch (e) {
    logError(`context flow ${flow.id}`, e);
  }
  return ctx;
};

const finish = async (tenantDB, flow, execution, status, error) => {
  const { Execution, Flow } = automationModels(tenantDB);
  await Execution.update(
    { status, error: error ? String(error).slice(0, 5000) : null, completed_at: new Date(), resume_at: null },
    { where: { id: execution.id } }
  );
  if (execution.is_test) return;
  // Counters are changed in SQL, never from the (cached) flow object: flows
  // are cached for a minute, so a read-modify-write here would lose counts
  // and a flow could never reach the auto-pause threshold.
  if (status === "failed") {
    await Flow.increment({ consecutive_failures: 1 }, { where: { id: flow.id } });
    const fresh = await Flow.findOne({ where: { id: flow.id }, attributes: ["consecutive_failures"], raw: true });
    const failures = fresh?.consecutive_failures || 1;
    const pause = failures >= AUTO_PAUSE_AFTER_FAILURES;
    if (pause) {
      await Flow.update(
        { is_paused: 1, paused_reason: `Paused after ${failures} failed runs in a row` },
        { where: { id: flow.id } }
      );
      clearFlowCache(tenantDB, flow.company_masters_id);
    }
    // Alert on the first failure of a streak and when the flow pauses - not on
    // every failed run, which would spam the owner while a flow keeps failing.
    if (failures === 1 || pause) {
      notifyFlowFailure(tenantDB, flow, execution.id, error, pause).catch((e) => logError("notifyFlowFailure", e));
    }
  } else if (status === "success") {
    await Flow.update({ consecutive_failures: 0 }, { where: { id: flow.id, consecutive_failures: { [Op.gt]: 0 } } });
  }
};

/**
 * Walk the queue until it is empty, a node waits, or the run fails.
 * Returns { status, response }.
 */
const runLoop = async (tenantDB, flow, execution, ctx) => {
  const { Execution, ExecutionLog } = automationModels(tenantDB);
  const settings = await getSettings(tenantDB, flow.company_masters_id);
  const run = {
    tenantDB,
    flow,
    execution_id: execution.id,
    company_masters_id: flow.company_masters_id,
    is_test: !!execution.is_test,
    run_as_user_id: flow.run_as_user_id || flow.created_by,
    chain_depth: execution.chain_depth || 0,
    source_flow_ids: [...new Set([...(ctx.__source_flow_ids || []), flow.id])],
    settings,
    response: ctx.__response || null,
  };
  const nodesById = new Map((flow.nodes || []).map((n) => [n.id, n]));
  const queue = ctx.__queue || [];
  let steps = ctx.__steps_done || 0;

  while (queue.length) {
    if (++steps > MAX_NODES_PER_RUN) {
      await finish(tenantDB, flow, execution, "failed", `Stopped: more than ${MAX_NODES_PER_RUN} steps in one run`);
      return { status: "failed", response: run.response };
    }
    const nodeId = queue.shift();
    const node = nodesById.get(nodeId);
    if (!node) continue;

    const handler = NODE_HANDLERS[node.type];
    const started = new Date();
    let result;
    let failed = null;
    try {
      if (!handler) throw new Error(`Unknown step type "${node.type}"`);
      result = await runInTenantContext(tenantDB, flow.company_masters_id, run.run_as_user_id, () =>
        handler({ ctx, params: node.parameters || {}, node, run })
      );
    } catch (e) {
      failed = e?.message || String(e);
    }

    const output = result?.output ?? null;
    const waiting = !failed && result?.wait;
    await ExecutionLog.create({
      execution_id: execution.id,
      node_id: node.id,
      node_type: node.type,
      status: failed ? "failed" : waiting ? "waiting" : "success",
      input: truncate(redact(result?.input ?? node.parameters ?? {})),
      output: truncate(redact(output)),
      error: failed,
      start_time: started,
      end_time: new Date(),
    });

    if (failed) {
      ctx.error = { node_id: node.id, node_type: node.type, message: failed };
      if (hasHandle(flow, node.id, "on_error")) {
        queue.unshift(...nextNodes(flow, node.id, "on_error"));
        continue;
      }
      ctx.__queue = [];
      await Execution.update({ context: truncate(redact(ctx), 200000) }, { where: { id: execution.id } });
      await finish(tenantDB, flow, execution, "failed", `${node.name || node.type}: ${failed}`);
      return { status: "failed", response: run.response };
    }

    if (result?.retry) {
      // Node asked to run again later (quiet hours / send limit): same node
      // goes back to the front of the queue and the run waits.
      queue.unshift(node.id);
    } else {
      ctx.steps[node.id] = output;
      ctx.last = output;
      if (result?.stop) {
        queue.length = 0;
        break;
      }
      queue.unshift(...nextNodes(flow, node.id, result?.handle || "src"));
    }

    if (waiting) {
      ctx.__queue = queue;
      ctx.__steps_done = steps;
      ctx.__response = run.response;
      await Execution.update(
        {
          status: "waiting",
          current_node_id: queue[0] || null,
          resume_at: result.wait.resume_at,
          wait_type: result.wait.wait_type || "time",
          context: truncate(ctx, 1000000),
        },
        { where: { id: execution.id } }
      );
      return { status: "waiting", response: run.response };
    }
  }

  ctx.__queue = [];
  await Execution.update({ context: truncate(redact(ctx), 200000) }, { where: { id: execution.id } });
  await finish(tenantDB, flow, execution, "success", null);
  return { status: "success", response: run.response };
};

/**
 * Start a run. Returns { execution_id, status, response, reason }.
 * Never throws.
 */
export const startRun = async ({
  tenantDB,
  flow,
  company_masters_id,
  triggerCtx,
  origin = "user",
  chain_depth = 0,
  parent_execution_id = null,
  source_flow_ids = [],
  is_test = false,
}) => {
  const { Execution, Flow } = automationModels(tenantDB);
  try {
    if (!is_test && (await isMaintenanceOn())) return { status: "skipped", reason: "Maintenance mode" };

    const trigger = findTriggerNode(flow);
    if (!trigger) return { status: "skipped", reason: "Flow has no trigger step" };

    const base = {
      flow_id: flow.id,
      flow_version: flow.version || 1,
      company_masters_id,
      record_type: triggerCtx.record_type || null,
      record_id: triggerCtx.record_id || null,
      is_test: is_test ? 1 : 0,
      origin,
      chain_depth,
      parent_execution_id,
      started_at: new Date(),
    };

    if (!is_test) {
      const limit = await canStartRun(tenantDB, company_masters_id);
      if (!limit.ok) {
        const skipped = await Execution.create({ ...base, status: "skipped", error: limit.reason, completed_at: new Date() });
        return { execution_id: skipped.id, status: "skipped", reason: limit.reason };
      }
    }

    const ctx = await buildInitialContext(tenantDB, flow, company_masters_id, triggerCtx);
    ctx.is_test = !!is_test;
    ctx.__source_flow_ids = source_flow_ids;
    ctx.__queue = [trigger.id];

    const execution = await Execution.create({ ...base, status: "running", current_node_id: trigger.id });
    execution.is_test = is_test;
    execution.chain_depth = chain_depth;

    if (!is_test) {
      await incrementUsage(tenantDB, company_masters_id);
      await Flow.increment({ run_count: 1 }, { where: { id: flow.id } });
      await Flow.update({ last_run_at: new Date() }, { where: { id: flow.id } });
    }

    // Business hours hold (trigger_config.business_hours_only).
    if (!is_test && flow.trigger_config?.business_hours_only) {
      const settings = await getSettings(tenantDB, company_masters_id);
      const at = nextBusinessMoment(settings);
      if (at) {
        await Execution.update(
          { status: "waiting", wait_type: "business_hours", resume_at: at.toDate(), context: JSON.stringify(ctx) },
          { where: { id: execution.id } }
        );
        return { execution_id: execution.id, status: "waiting" };
      }
    }

    const res = await runLoop(tenantDB, flow, execution, ctx);
    return { execution_id: execution.id, ...res };
  } catch (e) {
    logError(`startRun flow ${flow?.id}`, e);
    return { status: "failed", reason: e?.message || String(e) };
  }
};

/** Resume a waiting execution (called by the scheduler). */
export const resumeExecution = async (tenantDB, executionRow) => {
  const { Execution } = automationModels(tenantDB);
  // Claim it so two cron ticks / servers never resume the same run twice.
  const [claimed] = await Execution.update(
    { status: "running" },
    { where: { id: executionRow.id, status: "waiting" } }
  );
  if (!claimed) return null;
  try {
    const flow = await loadFlowForRun(tenantDB, executionRow.flow_id, executionRow.flow_version);
    if (!flow || flow.isDelete) {
      await Execution.update({ status: "cancelled", completed_at: new Date(), error: "Flow deleted" }, { where: { id: executionRow.id } });
      return null;
    }
    const ctx = safeJsonParse(executionRow.context, {});
    ctx.now = moment().format("YYYY-MM-DD HH:mm:ss");
    ctx.today = moment().format("YYYY-MM-DD");
    const execution = { ...executionRow, is_test: !!executionRow.is_test };
    return await runLoop(tenantDB, flow, execution, ctx);
  } catch (e) {
    logError(`resumeExecution ${executionRow.id}`, e);
    await Execution.update({ status: "failed", completed_at: new Date(), error: e?.message || String(e) }, { where: { id: executionRow.id } });
    return null;
  }
};
