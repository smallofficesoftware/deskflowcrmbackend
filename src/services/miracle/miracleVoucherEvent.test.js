// Dependency-free self-test for miracleVoucherEvent.js. Run directly:
//
//   node src/services/miracle/miracleVoucherEvent.test.js
import assert from "assert";
import { voucherAutomationEvent } from "./miracleVoucherEvent.js";
import { TRIGGERS } from "../automation/constants.js";

let passed = 0;
let failed = 0;
const test = (name, fn) => {
    try {
        fn();
        passed++;
        console.log(`  ok - ${name}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL - ${name}\n    ${e.message}`);
    }
};

test("a new voucher fires Document created", () => {
    assert.strictEqual(voucherAutomationEvent(true), "cart.created");
});

test("a re-synced voucher fires Document updated", () => {
    assert.strictEqual(voucherAutomationEvent(false), "cart.updated");
});

test("both events are triggers a flow can listen to", () => {
    for (const created of [true, false]) {
        const t = TRIGGERS[voucherAutomationEvent(created)];
        assert.ok(t, "trigger exists");
        assert.strictEqual(t.source, "event");
        assert.strictEqual(t.record, "cart");
    }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
