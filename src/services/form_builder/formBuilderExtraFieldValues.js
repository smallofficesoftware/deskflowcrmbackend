// Validation of the Phase 7 field types (plan item O3): Time, Currency,
// Percentage and GPS location. Pure module, no imports — the submission
// service calls validateExtraFieldValue before its own type switch and uses
// the result when this file handles the type.
//
//   time         "HH:mm" or "HH:mm:ss"        stored "HH:mm:00" (TIME column)
//   currency     a number, 2 decimals         stored as a number (DECIMAL(18,2))
//   percentage   a number, 0-100 by default   stored as a number (DECIMAL(9,2))
//   location     "lat,lng" (decimal degrees)  stored "lat,lng" with 6 decimals
//   barcode      any text (scanned or typed)  handled by the normal text rules
//
// Returns null when the type is not one of these, else { value } or { error }.

export const EXTRA_VALUE_TYPES = new Set(["time", "currency", "percentage", "location"]);

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const LOCATION_PATTERN = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function nameOf(field) {
  return field.label || field.key;
}

function roundTo(num, decimals) {
  const factor = 10 ** decimals;
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

export function validateExtraFieldValue(field, value) {
  switch (field?.type) {
    case "time": {
      const m = TIME_PATTERN.exec(String(value).trim());
      if (!m) return { error: `${nameOf(field)}: enter a time like 14:30` };
      return { value: `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}` };
    }
    case "currency":
    case "percentage": {
      const num = Number(String(value).replace(/[,\s₹]/g, ""));
      if (!Number.isFinite(num)) return { error: `${nameOf(field)} must be an amount` };
      const rounded = roundTo(num, 2);
      // A percentage is 0-100 unless the builder set other limits.
      const min = field.min != null ? Number(field.min) : field.type === "percentage" ? 0 : null;
      const max = field.max != null ? Number(field.max) : field.type === "percentage" ? 100 : null;
      if (min != null && rounded < min) return { error: `${nameOf(field)} must be at least ${min}${field.type === "percentage" ? "%" : ""}` };
      if (max != null && rounded > max) return { error: `${nameOf(field)} must be at most ${max}${field.type === "percentage" ? "%" : ""}` };
      if (Math.abs(rounded) >= 1e15) return { error: `${nameOf(field)} is too large` };
      return { value: rounded };
    }
    case "location": {
      const m = LOCATION_PATTERN.exec(String(value));
      if (!m) return { error: `${nameOf(field)}: capture the location again (it should look like 23.022500,72.571400)` };
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: `${nameOf(field)}: that isn't a real location` };
      return { value: `${lat.toFixed(6)},${lng.toFixed(6)}` };
    }
    default:
      return null;
  }
}
