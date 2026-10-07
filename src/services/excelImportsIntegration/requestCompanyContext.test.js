import assert from "node:assert/strict";
import { requestContext } from "../../config/context.js";
import { runInRequestCompany } from "./requestCompanyContext.js";

const req = { user: { id: 129, companyId: 67 }, tenantDB: { name: "db67" }, models: { m: 1 } };

// context missing (what an upload route sees): it is restored from the verified session
const restored = await runInRequestCompany(req, async () => {
    await Promise.resolve(); // survives awaits
    return requestContext.getStore();
});
assert.equal(restored.companyId, 67);
assert.equal(restored.tenantId, 129);
assert.equal(restored.a_application_login_id, 129);
assert.deepEqual(restored.tenantDB, { name: "db67" });

// nothing leaks outside the call
assert.equal(requestContext.getStore(), undefined);

// context intact: left exactly as it is
const intact = { companyId: 679, tenantId: 5 };
const kept = await requestContext.run(intact, () => runInRequestCompany(req, async () => requestContext.getStore()));
assert.equal(kept, intact);

// not enough to restore (no session company / no tenant DB): the function just runs
for (const bad of [{}, { user: { id: 1 } }, { user: { id: 1, companyId: 67 } }, { user: { companyId: 67 }, tenantDB: {} }]) {
    assert.equal(await runInRequestCompany(bad, async () => requestContext.getStore()), undefined);
}

// the return value is passed through
assert.equal(await runInRequestCompany(req, async () => 42), 42);

console.log("requestCompanyContext tests passed");
