// Dependency-free self-test for formBuilderApproval.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderApproval.test.js
import assert from "assert";
import {
  approvalOf,
  fieldStageId,
  editableKeysAt,
  initialStageState,
  nextState,
  approvalWriteState,
  stageIncompleteProblems,
  findApprovalProblems,
} from "./formBuilderApproval.js";

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

const settings = (stages, enabled = true) => ({ approval: { enabled, stages } });
const STAGES = [
  { id: "s1", name: "Counsellor" },
  { id: "s2", name: "Division Head", users: [12], teams: [3], signature_field: "head_sign" },
  { id: "s3", name: "Quotation Issuer", users: [15] },
];
const FIELDS = [
  { key: "company", label: "Company", type: "text", required: true },
  { key: "subject", label: "Subject", type: "text" },
  { key: "sec", label: "Feasibility", type: "section-header" },
  { key: "verdict", label: "Verdict", type: "dropdown", required: true, stage: "s2" },
  { key: "reason", label: "Reason", type: "text", stage: "s2", conditions: { rules: [{ field: "verdict", op: "is", value: "Reject" }] }, required_conditions: { rules: [{ field: "verdict", op: "is", value: "Reject" }] } },
  { key: "head_sign", label: "Head signature", type: "signature", stage: "s2" },
  { key: "quote_no", label: "Quotation no", type: "text", stage: "s3", required: true },
];
const APPROVAL = approvalOf(settings(STAGES));

console.log("formBuilderApproval.js self-test");

test("settings are normalised; approval needs two stages", () => {
  assert.strictEqual(APPROVAL.enabled, true);
  assert.deepStrictEqual(APPROVAL.stages[1], { id: "s2", name: "Division Head", users: [12], teams: [3], signature_field: "head_sign" });
  assert.strictEqual(approvalOf(settings([{ id: "s1", name: "A" }])).enabled, false);
  assert.strictEqual(approvalOf(settings(STAGES, false)).enabled, false);
  assert.strictEqual(approvalOf(null).enabled, false);
  assert.strictEqual(approvalOf("not json").enabled, false);
  assert.strictEqual(approvalOf(JSON.stringify(settings(STAGES))).enabled, true);
});

test("a field belongs to its stage, else the first", () => {
  assert.strictEqual(fieldStageId({ key: "a" }, APPROVAL.stages), "s1");
  assert.strictEqual(fieldStageId({ key: "a", stage: "s3" }, APPROVAL.stages), "s3");
  assert.strictEqual(fieldStageId({ key: "a", stage: "gone" }, APPROVAL.stages), "s1");
});

test("editable keys of a stage skip headings and other stages", () => {
  assert.deepStrictEqual([...editableKeysAt(FIELDS, APPROVAL.stages, "s1")].sort(), ["company", "subject"]);
  assert.deepStrictEqual([...editableKeysAt(FIELDS, APPROVAL.stages, "s2")].sort(), ["head_sign", "reason", "verdict"]);
});

test("creating an entry moves it to stage 2", () => {
  assert.deepStrictEqual(initialStageState(APPROVAL.stages), { current_stage: "s2", stage_status: "pending" });
  assert.strictEqual(initialStageState([{ id: "s1", name: "A" }]), null);
});

test("approve moves on; the last stage completes", () => {
  assert.deepStrictEqual(nextState(APPROVAL.stages, "s2", "approve"), { state: { current_stage: "s3", stage_status: "pending" } });
  assert.deepStrictEqual(nextState(APPROVAL.stages, "s3", "approve"), { state: { current_stage: "s3", stage_status: "completed" } });
});

test("send back returns to the stage above; stage 1 cannot send back", () => {
  assert.deepStrictEqual(nextState(APPROVAL.stages, "s3", "send_back"), { state: { current_stage: "s2", stage_status: "sent_back" } });
  assert.deepStrictEqual(nextState(APPROVAL.stages, "s2", "send_back"), { state: { current_stage: "s1", stage_status: "sent_back" } });
  assert.match(nextState(APPROVAL.stages, "s1", "send_back").error, /nobody above/);
  assert.match(nextState(APPROVAL.stages, "zzz", "approve").error, /no longer exists/);
  assert.match(nextState(APPROVAL.stages, "s2", "dance").error, /Unknown action/);
});

test("a full round trip: create -> s2 -> send back -> s1 -> re-approve -> s2 -> s3 -> completed", () => {
  let state = initialStageState(APPROVAL.stages);
  const step = (action) => {
    const r = nextState(APPROVAL.stages, state.current_stage, action);
    assert.ok(r.state, r.error);
    state = r.state;
    return state;
  };
  assert.strictEqual(step("send_back").current_stage, "s1");
  assert.strictEqual(step("approve").current_stage, "s2");
  assert.strictEqual(step("approve").current_stage, "s3");
  assert.strictEqual(step("approve").stage_status, "completed");
});

test("write state: no approval / old entries are open", () => {
  assert.strictEqual(approvalWriteState({ approval: approvalOf(null), fields: FIELDS, row: { current_stage: "s2" }, isActor: true }).mode, "open");
  assert.strictEqual(approvalWriteState({ approval: APPROVAL, fields: FIELDS, row: { current_stage: null }, isActor: false }).mode, "open");
});

test("write state: the person at the stage may change only that stage's fields", () => {
  const w = approvalWriteState({ approval: APPROVAL, fields: FIELDS, row: { current_stage: "s2", stage_status: "pending" }, isActor: true });
  assert.strictEqual(w.mode, "stage");
  assert.deepStrictEqual([...w.lockedKeys].sort(), ["company", "quote_no", "subject"]);
});

test("write state: somebody else waits, with the stage's name in the message", () => {
  const w = approvalWriteState({ approval: APPROVAL, fields: FIELDS, row: { current_stage: "s2", stage_status: "pending" }, isActor: false });
  assert.strictEqual(w.mode, "locked");
  assert.match(w.message, /Waiting for Division Head/);
  assert.strictEqual(w.lockedKeys.size, 6);
});

test("write state: completed is locked unless the user may edit completed entries", () => {
  const row = { current_stage: "s3", stage_status: "completed" };
  assert.strictEqual(approvalWriteState({ approval: APPROVAL, fields: FIELDS, row, isActor: true, canEditCompleted: false }).mode, "locked");
  assert.match(approvalWriteState({ approval: APPROVAL, fields: FIELDS, row, isActor: true }).message, /completed and locked/);
  assert.strictEqual(approvalWriteState({ approval: APPROVAL, fields: FIELDS, row, isActor: false, canEditCompleted: true }).mode, "open");
});

test("what stage 2 must do before approving: required fields, rules and the signature", () => {
  const none = stageIncompleteProblems({ fields: FIELDS, approval: APPROVAL, stageId: "s2", row: {}, fileKeys: new Set() });
  assert.deepStrictEqual(none, ["“Verdict” needs to be filled in", "Division Head must sign first (“Head signature”)"]);
  const rejected = stageIncompleteProblems({ fields: FIELDS, approval: APPROVAL, stageId: "s2", row: { verdict: "Reject" }, fileKeys: new Set(["head_sign"]) });
  assert.deepStrictEqual(rejected, ["“Reason” needs to be filled in"]);
  const done = stageIncompleteProblems({ fields: FIELDS, approval: APPROVAL, stageId: "s2", row: { verdict: "Reject", reason: "No budget" }, fileKeys: new Set(["head_sign"]) });
  assert.deepStrictEqual(done, []);
  const accepted = stageIncompleteProblems({ fields: FIELDS, approval: APPROVAL, stageId: "s2", row: { verdict: "Accept" }, fileKeys: new Set(["head_sign"]) });
  assert.deepStrictEqual(accepted, []);
});

test("other stages' required fields are not asked at this stage", () => {
  const problems = stageIncompleteProblems({ fields: FIELDS, approval: APPROVAL, stageId: "s1", row: {}, fileKeys: new Set() });
  assert.deepStrictEqual(problems, ["“Company” needs to be filled in"]);
});

test("publish check: valid settings pass; disabled passes", () => {
  assert.strictEqual(findApprovalProblems(settings(STAGES), FIELDS), null);
  assert.strictEqual(findApprovalProblems(settings([], false), FIELDS), null);
  assert.strictEqual(findApprovalProblems(null, FIELDS), null);
  assert.strictEqual(findApprovalProblems({ approval: { enabled: false } }, FIELDS), null);
});

test("publish check: plain-language problems", () => {
  assert.match(findApprovalProblems(settings([{ id: "s1", name: "A" }]), FIELDS), /at least two stages/);
  assert.match(findApprovalProblems(settings([{ id: "s1", name: "" }, { id: "s2", name: "B", users: [1] }]), FIELDS), /Stage 1 needs a name/);
  assert.match(findApprovalProblems(settings([{ id: "s1", name: "A" }, { id: "s2", name: "a", users: [1] }]), FIELDS), /Two stages are called/);
  assert.match(findApprovalProblems(settings([{ id: "s1", name: "A" }, { id: "s2", name: "B" }]), FIELDS), /Choose who works on “B”/);
  assert.match(findApprovalProblems(settings([{ id: "x", name: "A" }, { id: "s2", name: "B", users: [1] }]), FIELDS), /Stage 1 couldn't be read/);
  assert.match(findApprovalProblems(settings(STAGES), [...FIELDS, { key: "z", label: "Zed", type: "text", stage: "s9" }]), /“Zed” is set to a stage that was deleted/);
  assert.match(findApprovalProblems("nope", FIELDS), /couldn't be read/);
});

test("publish check: the signature must be a signature field of that stage", () => {
  const moved = FIELDS.map((f) => (f.key === "head_sign" ? { ...f, stage: "s3" } : f));
  assert.match(findApprovalProblems(settings(STAGES), moved), /must be filled at that stage/);
  const gone = FIELDS.filter((f) => f.key !== "head_sign");
  assert.match(findApprovalProblems(settings(STAGES), gone), /no longer exists/);
  const notSig = FIELDS.map((f) => (f.key === "head_sign" ? { ...f, type: "text" } : f));
  assert.match(findApprovalProblems(settings(STAGES), notSig), /no longer exists/);
});

test("more than 8 stages rejected", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `s${i + 1}`, name: `Stage ${i + 1}`, users: [1] }));
  assert.match(findApprovalProblems(settings(many), []), /at most 8/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
