import crypto from "crypto";

// PIN hashing for storefront customer accounts (plans/2026-10-15-ecommerce-
// b2b-b2c-plan.txt, P3/Q3 methods 1/2). No bcrypt dependency exists in this
// codebase (confirmed via package.json) and there is no existing password-
// hashing precedent to mirror (loginModel's own `password` column is stored
// unhashed - not something to copy). Uses Node's built-in crypto.pbkdf2Sync
// (no new dependency) with a random per-PIN salt - "<saltHex>:<hashHex>".

const PIN_REGEX = /^\d{4,6}$/;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export const isValidPinFormat = (pin) => PIN_REGEX.test(String(pin ?? "").trim());

export const hashPin = (pin) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(pin), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPin = (pin, storedHash) => {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, hash] = storedHash.split(":");
  const candidate = crypto.pbkdf2Sync(String(pin), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  const candidateBuf = Buffer.from(candidate, "hex");
  const hashBuf = Buffer.from(hash, "hex");
  if (candidateBuf.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, hashBuf);
};
