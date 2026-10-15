import assert from "node:assert/strict";
import { mobileNumberVariants } from "./contactMobileMatch.js";

// the form the import works with: 91 + 10 digits -> also the plain 10 digits
assert.deepEqual(mobileNumberVariants("919106760160"), ["919106760160", "9106760160"]);
assert.deepEqual(mobileNumberVariants(919106760160), ["919106760160", "9106760160"]);
// plain 10 digits -> also with the 91
assert.deepEqual(mobileNumberVariants("9106760160"), ["9106760160", "919106760160"]);
// punctuation is ignored
assert.deepEqual(mobileNumberVariants("+91 91067-60160"), ["919106760160", "9106760160"]);
// a 10-digit number that happens to start with 91 is still just a 10-digit number
assert.deepEqual(mobileNumberVariants("9112345678"), ["9112345678", "919112345678"]);
// other lengths (other countries, short numbers) match exactly only - no guessing
assert.deepEqual(mobileNumberVariants("971501234567"), ["971501234567"]); // 12 digits but not 91...
assert.deepEqual(mobileNumberVariants("14155552671"), ["14155552671"]);
assert.deepEqual(mobileNumberVariants("123456"), ["123456"]);
// nothing usable
for (const empty of ["", null, undefined, "abc", "--"]) assert.deepEqual(mobileNumberVariants(empty), []);

console.log("contactMobileMatch tests passed");
