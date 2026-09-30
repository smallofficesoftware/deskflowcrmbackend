// Recoverable storage for the Aadhaar format preset (Form Builder v2, plan
// item O1 "sensitive_storage"). A field with format_preset "aadhaar" and
// sensitive_storage "encrypted" keeps the full 12-digit number, encrypted
// with AES-256-GCM (node's built-in crypto) under a key that is dedicated
// to Form Builder: FORM_BUILDER_ENCRYPTION_KEY (64 hex chars = 32 bytes),
// read from process.env on every call so no restart-order issue. It is NOT
// the utils/encryption.js / WhatsApp key — separate blast radius.
//
// Stored format (self-identifying, versioned, fits VARCHAR(255)):
//
//   fbenc:v1:<last4>:<iv>:<tag>:<ciphertext>     (iv/tag/ct base64url)
//
// ~70 chars. <last4> is kept readable on purpose — it's exactly what the
// "masked" option already stores in the clear — so every read path can show
// XXXXXXXX1234 without decrypting (no key needed, no per-row crypto on a
// 100k-row Excel export). It is bound into the GCM auth tag as additional
// data, so editing it in the DB makes decryption fail.
//
// Read paths never return the ciphertext or the full number — they go
// through maskSensitiveValues(). Only the owner-only reveal endpoint calls
// decryptSensitive().
import crypto from "crypto";

export const SENSITIVE_PREFIX = "fbenc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;
const MASK = "XXXXXXXX";
const STORED_PATTERN = /^fbenc:v1:([0-9]{4}):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/;

// Field types a format_preset applies to (formBuilderSubmissionService
// imports this rather than keeping its own copy).
export const FORMAT_PRESET_TYPES = new Set(["text", "phone", "email"]);

function readKey() {
  const hex = process.env.FORM_BUILDER_ENCRYPTION_KEY;
  if (!hex || !KEY_PATTERN.test(hex.trim())) return null;
  return Buffer.from(hex.trim(), "hex");
}

export function isSensitiveStorageConfigured() {
  return readKey() !== null;
}

// A field that stores the full Aadhaar number encrypted. Missing / any
// other sensitive_storage value = "masked" (last 4 only).
export function isEncryptedAadhaarField(field) {
  return (
    !!field &&
    field.format_preset === "aadhaar" &&
    field.sensitive_storage === "encrypted" &&
    FORMAT_PRESET_TYPES.has(field.type)
  );
}

export function isSensitiveStored(value) {
  return typeof value === "string" && value.startsWith(SENSITIVE_PREFIX);
}

// plain: the validated 12-digit number. Throws if the key isn't set up —
// callers check isSensitiveStorageConfigured() first; there is never a
// plaintext fallback.
export function encryptSensitive(plain) {
  const key = readKey();
  if (!key) throw new Error("FORM_BUILDER_ENCRYPTION_KEY is not configured");
  const digits = String(plain);
  const last4 = digits.slice(-4).padStart(4, "0");
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(`${SENSITIVE_PREFIX}${last4}`));
  const ct = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SENSITIVE_PREFIX}${last4}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

// Returns the plain value, or null on anything wrong (key missing, wrong
// key, tampered/corrupt value, not an encrypted value) — never throws.
export function decryptSensitive(stored) {
  try {
    const key = readKey();
    if (!key) return null;
    const match = STORED_PATTERN.exec(String(stored ?? ""));
    if (!match) return null;
    const [, last4, ivB64, tagB64, ctB64] = match;
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64url"));
    decipher.setAAD(Buffer.from(`${SENSITIVE_PREFIX}${last4}`));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
    return plain;
  } catch {
    return null;
  }
}

// Display form XXXXXXXX1234 for a stored encrypted value, a plain 12-digit
// number, or an already-masked value. null/"" pass through. Anything else
// is fully masked rather than risk showing part of something unexpected.
export function maskAadhaar(digitsOrStored) {
  if (digitsOrStored == null || digitsOrStored === "") return digitsOrStored;
  const str = String(digitsOrStored);
  if (isSensitiveStored(str)) {
    const match = STORED_PATTERN.exec(str);
    return match ? `${MASK}${match[1]}` : `${MASK}XXXX`;
  }
  const compacted = str.replace(/[\s\-./]/g, "").toUpperCase();
  if (/^[0-9]{12}$/.test(compacted) || /^X{8}[0-9]{4}$/.test(compacted)) return `${MASK}${compacted.slice(-4)}`;
  return `${MASK}XXXX`;
}

// Read-path helper: returns a copy of row with every encrypted value
// replaced by its masked display (XXXXXXXX1234). Decided purely by the
// STORED value, and every column of the row is checked — not just the
// current schema's fields — so ciphertext never reaches a response even if
// the field was later switched to "Last 4 digits only", lost its preset,
// or was removed from the form (SELECT * still returns its column).
// Values already in XXXXXXXX1234 form are left exactly as they are.
// `fields` is accepted for call-site symmetry with maskRepeaterRows; for
// repeater child rows pass the repeater's columns.
// eslint-disable-next-line no-unused-vars
export function maskSensitiveValues(fields, row) {
  if (!row || typeof row !== "object") return row;
  let out = row;
  for (const [key, value] of Object.entries(row)) {
    if (!isSensitiveStored(value)) continue;
    if (out === row) out = { ...row };
    out[key] = maskAadhaar(value);
  }
  return out;
}

// { repeaterKey: [childRow, ...] } -> same shape, each child row masked
// against that repeater's sub-fields.
export function maskRepeaterRows(fields, repeaterRows) {
  if (!repeaterRows || typeof repeaterRows !== "object") return repeaterRows;
  const out = { ...repeaterRows };
  for (const field of fields || []) {
    if (field?.type !== "repeater" || !Array.isArray(out[field.key])) continue;
    out[field.key] = out[field.key].map((r) => maskSensitiveValues(field.columns || [], r));
  }
  return out;
}

// “Label” / “Label” (in “Repeater”) — same wording formBuilderService uses.
function quotedLabel(field, parentLabel) {
  const own = `“${field.label || field.key}”`;
  return parentLabel ? `${own} (in “${parentLabel}”)` : own;
}

// Publish-time check for the draft field list — returns a plain message
// for the form builder, or null when fine. Walks repeater sub-fields too.
export function sensitiveStoragePublishMessage(fields, parentLabel = null) {
  for (const field of fields || []) {
    if (field?.type === "repeater") {
      const nested = sensitiveStoragePublishMessage(field.columns || [], field.label || field.key);
      if (nested) return nested;
      continue;
    }
    if (!isEncryptedAadhaarField(field)) continue;
    const label = quotedLabel(field, parentLabel);
    // Random IV = the same number encrypts differently every time, so a
    // UNIQUE index could never catch a repeat.
    if (field.unique) {
      return `${label} can't be unique while it keeps the full Aadhaar number. Turn off “Unique” or choose “Last 4 digits only”.`;
    }
    if (!isSensitiveStorageConfigured()) {
      return `Secure storage isn't set up on this server yet, so ${label} can't keep the full number. Choose “Last 4 digits only” or ask your administrator.`;
    }
  }
  return null;
}
