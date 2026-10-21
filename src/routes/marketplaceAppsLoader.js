import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Self-registering marketplace-app router loader - plans/2026-10-15-ecommerce-
// b2b-b2c-plan.txt (4.5) and plans/2026-10-08-marketplace-tally-plan.txt both
// converge on requireAddon(appCode) as the ONE generic gate every marketplace
// app reuses instead of writing its own; this is the matching piece for
// ROUTE MOUNTING - a new marketplace app drops its router at
// src/routes/marketplace-apps/<appCode>/index.js (same default-export
// `(app) => {...}` shape every other router in this codebase already uses,
// see tally/index.js) and gets mounted automatically here, with zero edit to
// this file or indexRouter.js. Every router OUTSIDE this folder (including
// src/routes/apps/appsRouter.js - shared gating-status infra, not itself a
// marketplace app) keeps the existing manual import+call convention
// unchanged; this loader only covers the marketplace-apps/ subtree.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marketplaceAppsDir = path.join(__dirname, "marketplace-apps");

// Directory scan is synchronous; only the per-app import() is async (ESM has no
// synchronous dynamic import). The caller (indexRouter.js) doesn't await this -
// Express resolves a mounted router's routes per-request, not at mount time, and
// these are tiny already-on-disk local files, so every import() here resolves
// (as a microtask) well before the server's listen() socket can receive its
// first real connection. A failure in one app's router is logged, not thrown -
// it must not take down every other already-working route in the process.
export default (app) => {
  if (!fs.existsSync(marketplaceAppsDir)) return;

  const appCodes = fs
    .readdirSync(marketplaceAppsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const appCode of appCodes) {
    const entryPath = path.join(marketplaceAppsDir, appCode, "index.js");
    if (!fs.existsSync(entryPath)) continue;

    const mountUrl = `file://${entryPath.replace(/\\/g, "/")}`;
    import(mountUrl)
      .then(({ default: mountRouter }) => mountRouter(app))
      .catch((error) =>
        console.error(`marketplaceAppsLoader: failed to mount '${appCode}':`, error)
      );
  }
};
