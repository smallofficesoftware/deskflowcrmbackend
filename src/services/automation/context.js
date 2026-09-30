// Execution context helpers: {{ path.to.value }} templates and dot-path reads.

export const getPath = (obj, path) => {
  if (!path) return undefined;
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
};

const TEMPLATE_RE = /\{\{\s*([\w.$-]+)\s*\}\}/g;

/**
 * Resolve {{path}} placeholders against the context. A value that is a
 * single placeholder returns the raw value (keeps numbers / objects);
 * mixed text returns a string. Unresolved placeholders become "".
 */
export const resolveTemplate = (value, ctx) => {
  if (typeof value !== "string") return value;
  const single = value.match(/^\{\{\s*([\w.$-]+)\s*\}\}$/);
  if (single) {
    const v = getPath(ctx, single[1]);
    return v === undefined ? "" : v;
  }
  return value.replace(TEMPLATE_RE, (_, p) => {
    const v = getPath(ctx, p);
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
};

/** Deep-resolve every string inside an object / array. */
export const resolveDeep = (value, ctx) => {
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, ctx));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, ctx)]));
  }
  return resolveTemplate(value, ctx);
};

export const safeJsonParse = (value, fallback) => {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/** Strip values that should not be stored in logs (passwords, tokens). */
const SECRET_KEYS = /pass(word)?|secret|token|api_key|authorization/i;
export const redact = (value, depth = 0) => {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "***" : redact(v, depth + 1)])
    );
  }
  return value;
};
