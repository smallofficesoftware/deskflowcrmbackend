// Storefront OTP (mobile or email) - plans/2026-10-15-ecommerce-b2b-b2c-plan.txt,
// P3/Q3. Same stateless, signed-challenge design as the proven public-facing
// pattern in src/services/form_builder/formBuilderPublicOtp.js (no new DB table,
// the code never appears in the token, HMAC-signed with the app's own
// JWT_TOKEN_SIGNATURE) - generalized here to an `identifier` that can be either
// a mobile number or an email address, since the storefront needs OTP for both
// (methods 3 and 4, Q3), not just mobile. A new sibling file rather than editing
// formBuilderPublicOtp.js directly - that module already has its own test suite
// and a live caller (the public form OTP feature); changing its signature to
// generalize it risks breaking that, for no benefit to it.
//
//   createOtpChallenge(identifier) -> { code, token }   code = 6 digits to send
//   verifyOtpChallenge(token, identifier, entered) -> { ok: true } | { error }

import crypto from "crypto";
import { JWT_TOKEN_SIGNATURE } from "../../utils/appConstants.js";

const OTP_LENGTH = 6;
const VALID_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function hmac(parts) {
  return crypto.createHmac("sha256", JWT_TOKEN_SIGNATURE).update(parts.join("|")).digest("hex");
}

// Mobile numbers get the same bare-10-digit normalization formBuilderPublicOtp.js
// uses (whatever +91/91/0/00 prefix or separators the visitor typed); an email
// address is just lowercased/trimmed - no digit-stripping makes sense for it.
function normalizedIdentifier(identifier) {
  const raw = String(identifier ?? "").trim();
  if (raw.includes("@")) return raw.toLowerCase();

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

export function generateOtpCode() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function createOtpChallenge(identifier, { code = generateOtpCode(), now = Date.now() } = {}) {
  const id = normalizedIdentifier(identifier);
  const expires = now + VALID_MS;
  const attempts = 0;
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const sig = hmac([id, codeHash, String(expires), String(attempts)]);
  const token = Buffer.from(JSON.stringify({ id, codeHash, expires, attempts, sig })).toString("base64url");
  return { code, token };
}

function withAttempt(payload, attempts) {
  const sig = hmac([payload.id, payload.codeHash, String(payload.expires), String(attempts)]);
  return Buffer.from(JSON.stringify({ ...payload, attempts, sig })).toString("base64url");
}

export function verifyOtpChallenge(token, identifier, entered, { now = Date.now() } = {}) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(String(token), "base64url").toString("utf8"));
  } catch {
    return { error: "That code has expired. Request a new one." };
  }
  const { id, codeHash, expires, attempts, sig } = payload || {};
  if (!id || !codeHash || !Number.isInteger(expires) || !Number.isInteger(attempts) || !sig) {
    return { error: "That code has expired. Request a new one." };
  }
  if (sig !== hmac([id, codeHash, String(expires), String(attempts)])) {
    return { error: "That code has expired. Request a new one." };
  }
  if (now > expires) return { error: "That code has expired. Request a new one." };
  if (attempts >= MAX_ATTEMPTS) return { error: "Too many attempts. Request a new code." };
  if (id !== normalizedIdentifier(identifier)) return { error: "Enter the code sent to the address above." };

  const enteredHash = crypto.createHash("sha256").update(String(entered ?? "").trim()).digest("hex");
  if (enteredHash !== codeHash) {
    return { error: "That code is not correct.", token: withAttempt(payload, attempts + 1) };
  }
  return { ok: true };
}
