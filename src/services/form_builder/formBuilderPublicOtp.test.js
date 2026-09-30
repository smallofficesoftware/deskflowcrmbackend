// Dependency-free self-test for formBuilderPublicOtp.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderPublicOtp.test.js
import assert from "assert";
import { createOtpChallenge, verifyOtpChallenge, generateOtpCode } from "./formBuilderPublicOtp.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log("formBuilderPublicOtp.js self-test");

test("code is 6 digits", () => {
  for (let i = 0; i < 20; i++) assert.match(generateOtpCode(), /^\d{6}$/);
});

test("the right code, for the right mobile, verifies", () => {
  const { code, token } = createOtpChallenge("9876543210");
  assert.deepStrictEqual(verifyOtpChallenge(token, "9876543210", code), { ok: true });
});

test("mobile is normalised (spaces, +91) before matching", () => {
  const { code, token } = createOtpChallenge("+91 98765 43210");
  assert.deepStrictEqual(verifyOtpChallenge(token, "9876543210", code), { ok: true });
  assert.deepStrictEqual(verifyOtpChallenge(token, "919876543210", code), { ok: true });
});

test("a wrong code is rejected and hands back a token with the attempt counted", () => {
  const { code, token } = createOtpChallenge("9876543210");
  const r = verifyOtpChallenge(token, "9876543210", "000000");
  assert.match(r.error, /not correct/);
  assert.ok(r.token);
  assert.notStrictEqual(r.token, token);
  // the right code still works on the bumped token
  assert.deepStrictEqual(verifyOtpChallenge(r.token, "9876543210", code), { ok: true });
});

test("5 wrong attempts lock the challenge, even with the right code after", () => {
  let { code, token } = createOtpChallenge("9876543210");
  for (let i = 0; i < 5; i++) {
    const r = verifyOtpChallenge(token, "9876543210", "000000");
    token = r.token;
  }
  assert.match(verifyOtpChallenge(token, "9876543210", code).error, /Too many attempts/);
});

test("a code for a different mobile number is rejected", () => {
  const { code, token } = createOtpChallenge("9876543210");
  assert.match(verifyOtpChallenge(token, "9111111111", code).error, /Enter the code sent/);
});

test("an expired challenge is rejected", () => {
  const now = 1_000_000;
  const { code, token } = createOtpChallenge("9876543210", { now });
  assert.deepStrictEqual(verifyOtpChallenge(token, "9876543210", code, { now: now + 1000 }), { ok: true });
  assert.match(verifyOtpChallenge(token, "9876543210", code, { now: now + 11 * 60 * 1000 }).error, /expired/);
});

test("a tampered token is rejected", () => {
  const { code, token } = createOtpChallenge("9876543210");
  const bad = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(token, "base64url").toString()), m: "9111111111" })).toString("base64url");
  assert.match(verifyOtpChallenge(bad, "9111111111", code).error, /expired/);
});

test("garbage input never throws", () => {
  assert.match(verifyOtpChallenge("not-a-token", "9876543210", "123456").error, /expired/);
  assert.match(verifyOtpChallenge("", "", "").error, /expired/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
