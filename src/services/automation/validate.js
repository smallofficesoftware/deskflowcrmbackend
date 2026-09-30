import { NODE_DEFS, TRIGGER_CONFIG } from "./catalog.js";
import { TRIGGERS } from "./constants.js";
import { NODE_HANDLERS } from "./nodes/index.js";

// Flow validation. Drafts may be incomplete; active flows must be complete.
// Returns a list of plain-language problems ([] = fine).

const has = (v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && !v.length);

/** showIf: { field: value | [values] } - all keys must match. */
const visible = (field, params) => {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([k, want]) => {
    const got = params?.[k] ?? field.default;
    return [].concat(want).map(String).includes(String(got));
  });
};

const missingFields = (defs, params) =>
  (defs || []).filter((f) => f.required && visible(f, params) && !has(params?.[f.key])).map((f) => f.label);

const findCycle = (nodes, connections) => {
  const next = new Map(nodes.map((n) => [n.id, []]));
  for (const c of connections) if (next.has(c.source)) next.get(c.source).push(c.target);
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const t of next.get(id) || []) if (next.has(t) && visit(t)) return true;
    state.set(id, 2);
    return false;
  };
  return nodes.some((n) => visit(n.id));
};

export const validateFlow = (flow, { complete = false } = {}) => {
  const errors = [];
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const connections = Array.isArray(flow.connections) ? flow.connections : [];

  if (!has(flow.name)) errors.push("Give the automation a name");
  if (!TRIGGERS[flow.trigger_type]) errors.push("Pick a trigger");

  const ids = new Set();
  for (const n of nodes) {
    if (!n.id || ids.has(n.id)) errors.push(`Duplicate or missing step id "${n.id ?? ""}"`);
    ids.add(n.id);
    if (!NODE_HANDLERS[n.type]) errors.push(`Unknown step type "${n.type}"`);
  }
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) errors.push("An automation needs exactly one trigger step");

  for (const c of connections) {
    if (!ids.has(c.source) || !ids.has(c.target)) errors.push("A connection points to a step that does not exist");
    else if (triggers[0] && c.target === triggers[0].id) errors.push("Nothing can connect back into the trigger");
  }
  if (findCycle(nodes, connections)) errors.push("Steps cannot loop back to an earlier step");

  if (flow.trigger_type !== "webhook.received" && nodes.some((n) => n.type === "webhook_response")) {
    errors.push('"Webhook response" only works with the "Incoming webhook" trigger');
  }

  if (!complete) return errors;

  for (const f of TRIGGER_CONFIG[flow.trigger_type] || []) {
    if (f.required && visible(f, flow.trigger_config) && !has(flow.trigger_config?.[f.key])) {
      errors.push(`Trigger: ${f.label} is required`);
    }
  }

  const actions = nodes.filter((n) => n.type !== "trigger");
  if (!actions.length) errors.push("Add at least one step after the trigger");

  for (const n of actions) {
    const def = NODE_DEFS[n.type];
    if (!def) continue;
    const miss = missingFields(def.fields, n.parameters);
    if (miss.length) errors.push(`${def.label}: fill in ${miss.join(", ")}`);
  }

  if (triggers[0]) {
    const seen = new Set([triggers[0].id]);
    const stack = [triggers[0].id];
    while (stack.length) {
      const id = stack.pop();
      for (const c of connections) {
        if (c.source === id && !seen.has(c.target)) {
          seen.add(c.target);
          stack.push(c.target);
        }
      }
    }
    const loose = actions.filter((n) => !seen.has(n.id));
    if (loose.length) errors.push(`${loose.length} step(s) are not connected to the trigger`);
    if (actions.length && !connections.some((c) => c.source === triggers[0].id)) errors.push("Connect the trigger to the first step");
  }
  return errors;
};
