// Dependency-free self-test for miracleLedgerRequest.js (no network, no DB). Run directly:
//
//   node src/services/miracle/miracleLedgerRequest.test.js
import assert from "assert";
import { postLedger, rejectedFieldsFromMessage } from "./miracleLedgerRequest.js";

let passed = 0;
let failed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok - ${name}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL - ${name}\n    ${e.message}`);
    }
}

// A fake axios instance: answers each call from `replies` in order and records the payloads.
const fakeApi = (replies) => {
    const calls = [];
    return {
        calls,
        post: async (endpoint, payload) => {
            calls.push({ endpoint, payload });
            return { data: replies[calls.length - 1] };
        },
    };
};

const E0006 = (fields) => ({
    IsError: true,
    ErrorCode: "E0006",
    Message: `Invalid value(s) in 'rptfield'. Not expected: ${fields}.`,
});

await test("reads the refused columns out of the message", () => {
    assert.deepStrictEqual(rejectedFieldsFromMessage("Invalid value(s) in 'rptfield'. Not expected: lastactiondt."), ["lastactiondt"]);
    assert.deepStrictEqual(rejectedFieldsFromMessage("Not expected: a, b ."), ["a", "b"]);
    assert.deepStrictEqual(rejectedFieldsFromMessage("Token is Expired."), []);
    assert.deepStrictEqual(rejectedFieldsFromMessage(undefined), []);
});

await test("a good response is returned as is, with one call", async () => {
    const api = fakeApi([{ Data: [], IsError: false }]);
    const res = await postLedger(api, "TPA/M2/V1/AccountLedger", { rptfield: ["accid"] });
    assert.strictEqual(api.calls.length, 1);
    assert.strictEqual(res.droppedFields, undefined);
});

await test("E0006 drops the named column and retries once", async () => {
    const api = fakeApi([E0006("lastactiondt"), { Data: [{ accid: "1" }], IsError: false }]);
    const payload = { fromdate: "2026-04-01", rptfield: ["accid", "lastactiondt", "accnm"], rptfilter: { x: ["y"] } };
    const res = await postLedger(api, "TPA/M2/V1/AccountLedger", payload);
    assert.strictEqual(api.calls.length, 2);
    assert.deepStrictEqual(api.calls[1].payload.rptfield, ["accid", "accnm"]);
    assert.deepStrictEqual(api.calls[1].payload.rptfilter, { x: ["y"] });
    assert.strictEqual(api.calls[1].payload.fromdate, "2026-04-01");
    assert.deepStrictEqual(res.droppedFields, ["lastactiondt"]);
    assert.deepStrictEqual(payload.rptfield, ["accid", "lastactiondt", "accnm"], "the caller's payload is not changed");
});

await test("column names match without regard to case", async () => {
    const api = fakeApi([E0006("LastActionDT"), { IsError: false }]);
    await postLedger(api, "e", { rptfield: ["accid", "lastactiondt"] });
    assert.deepStrictEqual(api.calls[1].payload.rptfield, ["accid"]);
});

await test("a refusal that names no column of ours is returned without a retry", async () => {
    const api = fakeApi([E0006("somethingelse")]);
    const res = await postLedger(api, "e", { rptfield: ["accid"] });
    assert.strictEqual(api.calls.length, 1);
    assert.strictEqual(res.data.ErrorCode, "E0006");
});

await test("no retry when every column would be dropped", async () => {
    const api = fakeApi([E0006("lastactiondt")]);
    await postLedger(api, "e", { rptfield: ["lastactiondt"] });
    assert.strictEqual(api.calls.length, 1);
});

await test("other Miracle errors are not retried", async () => {
    const api = fakeApi([{ IsError: true, ErrorCode: "AH015", Message: "Token is Expired." }]);
    await postLedger(api, "e", { rptfield: ["accid"] });
    assert.strictEqual(api.calls.length, 1);
});

await test("a retry that fails again is returned for the caller to report", async () => {
    const api = fakeApi([E0006("a"), E0006("b")]);
    const res = await postLedger(api, "e", { rptfield: ["x", "a", "b"] });
    assert.strictEqual(api.calls.length, 2, "only one retry");
    assert.strictEqual(res.data.ErrorCode, "E0006");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
