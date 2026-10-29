// Dependency-free self-test for miracleTokenExpired.js. Run: node src/utils/miracleTokenExpired.test.js
import assert from "assert";
import { isTokenExpiredBody } from "./miracleTokenExpired.js";

let failed = 0;
const test = (name, fn) => {
    try {
        fn();
    } catch (e) {
        failed += 1;
        console.error(`FAIL: ${name}\n  ${e.message}`);
    }
};

test("the 200 body seen in the live log is recognised", () => {
    assert.strictEqual(isTokenExpiredBody({ UniqueId: "", IsError: true, ErrorCode: "EXCEP002", Message: "Token is Expired." }), true);
});
test("the 401 body is recognised too", () => {
    assert.strictEqual(isTokenExpiredBody({ IsError: true, ErrorCode: "AH015", Message: "Token is Expired." }), true);
});
test("case and spacing do not matter", () => {
    assert.strictEqual(isTokenExpiredBody({ IsError: true, Message: "token  IS expired" }), true);
});
test("other errors, including other EXCEP002 messages, are not token errors", () => {
    assert.strictEqual(isTokenExpiredBody({ IsError: true, ErrorCode: "EXCEP002", Message: "Audited Account's Balance Can't be Changed." }), false);
    assert.strictEqual(isTokenExpiredBody({ IsError: true, Message: "Product cannot be Unmap, Stock is Present" }), false);
});
test("a success body, or no body, is not a token error", () => {
    assert.strictEqual(isTokenExpiredBody({ IsError: false, Message: "Token is Expired." }), false);
    assert.strictEqual(isTokenExpiredBody(null), false);
    assert.strictEqual(isTokenExpiredBody(undefined), false);
    assert.strictEqual(isTokenExpiredBody("Token is Expired."), false);
});

console.log(`miracleTokenExpired: ${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
