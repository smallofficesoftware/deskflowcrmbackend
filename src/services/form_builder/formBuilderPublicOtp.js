// Mobile OTP check on a public form (plan item M5). Stateless: no OTP table.
// The OTP digits are hashed into a signed "challenge" token handed back to
// the browser; the browser returns that same token plus what the visitor
// typed, and the server re-checks the hash. Reuses the app's own token
// signing key (JWT_TOKEN_SIGNATURE, appConstants.js) — a WhatsApp OTP here
// is a much lower-stakes secret than a login token, so a dedicated key
// would be more ceremony than the risk calls for.
//
//   createOtpChallenge(mobile) -> { code, token }   code = 6 digits to send by WhatsApp
//   verifyOtpChallenge(token, mobile, entered) -> { ok: true } | { error }

import crypto from "crypto";
import { JWT_TOKEN_SIGNATURE } from "../../utils/appConstants.js";

const OTP_LENGTH = 6;
const VALID_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function hmac(parts) {
  return crypto.createHmac("sha256", JWT_TOKEN_SIGNATURE).update(parts.join("|")).digest("hex");
}

// Bare 10-digit number, whatever prefix (+91 / 91 / 0 / 00) or separators the
// visitor typed — same normalisation idea as sharedFunctions.js's
// normalizeToTenDigit, kept local so this module stays dependency-free.
function normalizedMobile(mobile) {
  let digits = String(mobile ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

export function generateOtpCode() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

// A signed, stateless challenge: mobile + code-hash + expiry + attempts, all
// readable only by this server (the code itself never appears in the token).
export function createOtpChallenge(mobile, { code = generateOtpCode(), now = Date.now() } = {}) {
  const m = normalizedMobile(mobile);
  const expires = now + VALID_MS;
  const attempts = 0;
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const sig = hmac([m, codeHash, String(expires), String(attempts)]);
  const token = Buffer.from(JSON.stringify({ m, codeHash, expires, attempts, sig })).toString("base64url");
  return { code, token };
}

// Bumps the attempt count inside the same signed token, so a stolen token
// can't be replayed past MAX_ATTEMPTS by resending the original.
function withAttempt(payload, attempts) {
  const sig = hmac([payload.m, payload.codeHash, String(payload.expires), String(attempts)]);
  return Buffer.from(JSON.stringify({ ...payload, attempts, sig })).toString("base64url");
}

export function verifyOtpChallenge(token, mobile, entered, { now = Date.now() } = {}) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(String(token), "base64url").toString("utf8"));
  } catch {
    return { error: "That code has expired. Request a new one." };
  }
  const { m, codeHash, expires, attempts, sig } = payload || {};
  if (!m || !codeHash || !Number.isInteger(expires) || !Number.isInteger(attempts) || !sig) {
    return { error: "That code has expired. Request a new one." };
  }
  if (sig !== hmac([m, codeHash, String(expires), String(attempts)])) {
    return { error: "That code has expired. Request a new one." };
  }
  if (now > expires) return { error: "That code has expired. Request a new one." };
  if (attempts >= MAX_ATTEMPTS) return { error: "Too many attempts. Request a new code." };
  if (m !== normalizedMobile(mobile)) return { error: "Enter the code sent to the mobile number above." };

  const enteredHash = crypto.createHash("sha256").update(String(entered ?? "").trim()).digest("hex");
  if (enteredHash !== codeHash) {
    return { error: "That code is not correct.", token: withAttempt(payload, attempts + 1) };
  }
  return { ok: true };
}
