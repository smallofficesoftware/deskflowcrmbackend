import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkspaceLimit, decideWorkspaceCreate, pickRightsLimit, DEFAULT_WORKSPACE_LIMIT } from "./workspaceLimitRules.js";

test("parseWorkspaceLimit", () => {
  assert.equal(parseWorkspaceLimit("1"), 1);
  assert.equal(parseWorkspaceLimit("1,00,000"), 100000);
  assert.equal(parseWorkspaceLimit(3), 3);
  for (const v of ["0", "", null, undefined, "abc", "-2"]) assert.equal(parseWorkspaceLimit(v), null);
});

test("plan limit 1: first workspace allowed, second blocked", () => {
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 0 }).allowed, true);
  const r = decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 1 });
  assert.deepEqual(r, { allowed: false, limit: 1, used: 1 });
});

test("plan limit 0 / empty means unlimited", () => {
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "0", used: 50 }).allowed, true);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "", used: 50 }).limit, null);
});

test("no plan entry falls back to the default", () => {
  assert.equal(DEFAULT_WORKSPACE_LIMIT, 1);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: false, rawDataLimit: null, used: 0 }).allowed, true);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: false, rawDataLimit: null, used: 1 }).allowed, false);
});

test("already above the limit stays blocked, existing ones untouched", () => {
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "2", used: 5 }).allowed, false);
});

test("add-on workspaces raise the plan limit", () => {
  assert.deepEqual(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 1, extraWorkspaces: 2 }), { allowed: true, limit: 3, used: 1 });
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 3, extraWorkspaces: 2 }).allowed, false);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: false, rawDataLimit: null, used: 1, extraWorkspaces: 1 }).allowed, true);
});

test("add-ons do not change an unlimited plan; junk extras ignored", () => {
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "0", used: 9, extraWorkspaces: 3 }).limit, null);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 1, extraWorkspaces: "x" }).allowed, false);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 1, extraWorkspaces: -5 }).limit, 1);
});

test("pickRightsLimit: smallest positive limit across users, like the contact check", () => {
  assert.equal(pickRightsLimit([{ limit: 3 }, { limit: 2 }, { limit: "5" }]), 2);
  assert.equal(pickRightsLimit([{ limit: "1,00,000" }]), 100000);
});

test("pickRightsLimit: 0 = unlimited, empty / missing = nothing usable", () => {
  assert.equal(pickRightsLimit([{ limit: 0 }, { limit: "0" }]), null);
  assert.equal(pickRightsLimit([{ limit: 0 }, { limit: 4 }]), 4);
  for (const list of [[], null, [{}], [{ limit: "" }], [{ limit: "abc" }], [{ limit: -2 }]]) {
    assert.equal(pickRightsLimit(list), undefined);
  }
});

test("rights limit wins over the plan lookup; undefined falls back; add-ons stay on top", () => {
  assert.deepEqual(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 1, rightsLimit: 3 }), { allowed: true, limit: 3, used: 1 });
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "0", used: 9, rightsLimit: 2 }).allowed, false);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: false, rawDataLimit: null, used: 7, rightsLimit: null }).limit, null);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: false, rawDataLimit: null, used: 1, rightsLimit: undefined }).allowed, false);
  assert.equal(decideWorkspaceCreate({ hasPlanEntry: true, rawDataLimit: "1", used: 2, rightsLimit: 2, extraWorkspaces: 1 }).allowed, true);
});
