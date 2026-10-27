// Read-only drift check between the mobile report catalog (this repo) and the web report menu
// (reportsMenuData.tsx in the frontend repo). The web menu is the source of truth for what a
// report's key and page id are; the app catalog is a hand-kept subset of it.
//
//   npm run check:report-catalog
//   npm run check:report-catalog -- ../frontend-document-designer     (frontend checkout, default shown)
//
// Fails (exit 1) when the catalog has a problem that would break the app:
//   - a duplicate key
//   - a key that no longer exists in the web menu
//   - a page id that differs from the web menu's page id for that key
// Web menu entries that are not in the catalog are only listed: many are web-only administration
// entries on purpose, but a new web report that the app should show would appear here.

import fs from "fs";
import path from "path";
import { REPORT_CATALOG } from "../services/report_catalog/reportCatalog.js";

const frontendDir = path.resolve(process.argv[2] || "../frontend-document-designer");
const menuFile = path.join(frontendDir, "src/pages/side-view/reportsMenuData.tsx");
const enumFile = path.join(frontendDir, "src/helpers/AppEnum.ts");

if (!fs.existsSync(menuFile) || !fs.existsSync(enumFile)) {
  console.error(`Frontend files not found under ${frontendDir}. Pass the frontend checkout path as the first argument.`);
  process.exit(2);
}

// PAGE_ID.NAME = number (frontend enum)
const pageIds = {};
for (const m of fs.readFileSync(enumFile, "utf8").matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(\d+)\s*,/gm)) {
  pageIds[m[1]] = Number(m[2]);
}

// One web entry per `value:` line, with the `pageId:` that follows it inside the same entry.
const webEntries = new Map();
const menuText = fs.readFileSync(menuFile, "utf8");
for (const m of menuText.matchAll(/value:\s*"([^"]+)"\s*,(?:\s*pageId:\s*PAGE_ID\.([A-Z0-9_]+)\s*,)?/g)) {
  webEntries.set(m[1], m[2] ? pageIds[m[2]] ?? null : null);
}

const problems = [];
const seen = new Set();
const catalogKeys = new Set();
for (const group of REPORT_CATALOG) {
  for (const entry of group.entries) {
    if (seen.has(entry.key)) problems.push(`duplicate key "${entry.key}" in the catalog`);
    seen.add(entry.key);
    catalogKeys.add(entry.key);

    if (!webEntries.has(entry.key)) {
      problems.push(`"${entry.label}" (${entry.key}) is not in the web report menu any more`);
    } else {
      const webPage = webEntries.get(entry.key);
      if (webPage !== null && webPage !== entry.pageId) {
        problems.push(`"${entry.label}" (${entry.key}): catalog pageId ${entry.pageId}, web menu pageId ${webPage}`);
      }
    }
  }
}

const webOnly = [...webEntries.keys()].filter((k) => !catalogKeys.has(k));

console.log(`Catalog: ${catalogKeys.size} reports in ${REPORT_CATALOG.length} groups. Web menu: ${webEntries.size} entries.`);
if (webOnly.length > 0) {
  console.log(`\nIn the web menu but not in the app catalog (${webOnly.length}) - fine for web-only admin entries, add the reports the app should show:`);
  console.log("  " + webOnly.join(", "));
}
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
console.log("\nOK: no duplicate keys, no stale keys, no page id mismatches.");
