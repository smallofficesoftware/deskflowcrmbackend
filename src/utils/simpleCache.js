// Tiny in-process, in-memory TTL cache — no Redis/node-cache/etc anywhere
// else in this codebase, so this is a small hand-rolled utility rather than
// a new dependency for something this size. Single-process only: if this
// backend is ever scaled to multiple instances behind a load balancer, this
// stops being a shared cache (each instance has its own) — swap for a real
// shared cache (Redis) at that point, not before.
const store = new Map(); // key -> { value, expiresAt }

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Dashboard widget results are keyed off the definition they reuse, not
// the widget itself — multiple widgets/dashboards can point at the same
// report_definition_id and share one cached run.
export function invalidateCached(key) {
  store.delete(key);
}
