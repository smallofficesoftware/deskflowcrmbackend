// Minimal viable spam guard for the public form submit route (plan §2) —
// in-memory, per-IP-per-form-per-minute. Explicitly NOT a strong guard: it
// is per-Node-process, so if this backend ever runs multiple processes the
// effective limit is (configured limit) x (process count) — acceptable for
// v1's bar, flagged here rather than silently assumed to be stronger than
// it is.
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const hits = new Map(); // key -> [timestamps]

function keyFor(req) {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const shareToken = req.body?.shareToken || "unknown";
  return `${ip}:${shareToken}`;
}

export const publicFormRateLimit = (req, res, next) => {
  const key = keyFor(req);
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(200).send({
      ack: 0,
      code: 429,
      ack_msg: "Too many submissions — please try again in a minute",
    });
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  next();
};
