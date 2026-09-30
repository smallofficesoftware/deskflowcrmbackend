# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is `deskflowcrmbackend` — the main CRM backend for Deskflow CRM, a multi-tenant SaaS (each customer company gets its own tenant MySQL/MariaDB database, plus one shared master database). It's part of a 3-repo project: `deskflowcrmbackend` (this repo), `deskflowcrmfrontend`, and `deskflowadminpanel` (superadmin control plane, separate CLAUDE.md).

This directory is a git worktree of `deskflowcrmbackend`, not a plain clone — a second worktree of the same repo (the "main" `backend` checkout) may exist alongside it. **Both default to `PORT=2424`; only one can actually be listening.** Before trusting that a local change took effect, confirm the process bound to 2424 is this worktree's own (check `logs/crm_backend.log` mtime, or the owning PID's command line) — the other worktree's stale `nodemon` can be silently dead while this one never started.

## Commands

- `npm run dev` — start with nodemon, `NODE_ENV=development`, logs to `logs/crm_backend.log`
- `npm start` — `NODE_ENV=production tsx src/index.js`
- `npm run check:tenant:schema-drift` — compares every tenant DB (from `tenant_masters` in the master DB) against reference DB `smalloffice_sample_tenant`; read-only, reports missing tables/columns, type mismatches, extra tables. Writes `tenant_schema_diff_report_<timestamp>.txt` (gitignored).
- Migrations/seeders, run separately for `master` vs `tenant` (applies to every tenant DB):
  - `npm run create:migration:master` / `:tenant` — scaffold a new migration
  - `npm run migrate:master:up:dev` / `:down:dev` / `:status:dev` / `:verify:dev` (swap `master`→`tenant`, `dev`→`prod` as needed)
  - `npm run migrate:all:up:dev`, `seed:all:up:dev`, `deploy:dev` (migrate+seed+verify), `rollback:dev` — combined helpers
- No test runner is configured in this repo.

## Architecture

- Multi-tenant: one master DB (company/tenant registry, plans, application pages, maintenance mode, etc. — config in `src/config/database-master.js`, uses `sequelize-cli` style env-keyed config from `.env.<NODE_ENV>`) plus one MySQL database per tenant company, cloned at signup from `smalloffice_sample_tenant`. `src/config/dbManager.js` / `globalSequelize.js` hold per-tenant Sequelize connections and every tenant model; `src/config/sequelize.js` / `context.js` carry per-request tenant context.
- `src/middlewares/tenantMiddleware.js` resolves the request's tenant (`x-tenant-id` header, authenticated user, WhatsApp webhook `sessionName` like `a3055_c606`, or body/query fallback) and company id before route handlers run, so handlers work against the right tenant DB connection.
- `src/routes/<area>/` + `src/controllers/` + `src/services/` + `src/models/` mirror each other by feature area (activities, company_setup, configuration, form_builder, hr, masters, online-store, product_settings, production, report_builder, webhook, whatsapp, ...). `src/routes/indexRouter.js` mounts them all.
- `src/middlewares/maintenanceMode.js` + `src/models/configuration/maintenanceModesModel.js` gate requests on the shared master-DB `maintenance_modes` row (`is_maintenance`, `is_logout_strict`, `is_socket_disabled`) — same row the admin panel's Ops page edits.
- `src/middlewares/payloadSecurity.js` (`encryptRequest`/`decryptRequest`) optionally AES-encrypts API responses when `ENCRYPT_SMALL_OFFICE_CRM_RESPONSE` is on; `src/middlewares/auth.js` / `miracleAuth.js` handle session auth (the latter for the separate Miracle Cloud ERP integration).
- Socket.io (`src/services/1socketIOServices/`) for realtime; `node-cron` jobs (e.g. `src/services/pdfmeEngine/versionRetentionCron.js`) run in-process.
- In production (`NODE_ENV === "production"`), `console.log`/`console.debug` are silenced at the top of `src/index.js` (leftover debug calls scattered through the codebase were never migrated to the `pino` logger in `src/utils/logger.js`) — `console.error`/`warn` still print. Prefer `logger` over `console.log` in new code.
- `.env.<NODE_ENV>` files (`.env.development`, `.env.production`, `.env.DEMO`) are gitignored and hold real per-environment DB/secret values — never commit one, and check `git status` before every commit for a stray local override.

## Database schema changes

Every schema change (`CREATE TABLE`, `ALTER TABLE`, or a data-fixing `UPDATE`/`INSERT` tied to a schema change) must be logged in `alter.txt`, in addition to a Sequelize migration file under `migration/master/migrations/` or `migration/tenant/migrations/` (whichever DB it targets).

Append a new entry at the end of `alter.txt`, following the existing format exactly:

```
DD-MM-YYYY <name>
<raw SQL statement(s)>
```

- Date in `DD-MM-YYYY` format, matching the day the change is made.
- `<name>` is the team member the change is attributed to (e.g. `Dhaval`) — match existing entries, which are all human names, not tool/assistant names.
- Include the actual runnable SQL — `CREATE TABLE` with full column definitions, `ALTER TABLE`, indexes, seed `INSERT`s — not a description of the change.
- This file is the team's authoritative running changelog of manually-applied DB changes across tenant databases; it is separate from and in addition to the versioned migration files in `migration/{master,tenant}/migrations/`.

### New tenant tables also need `create_company_copy.sql`

`new_company_creation_sql/SQL/create-company/create_company_copy.sql` provisions every brand-new tenant database by cloning table structure from a reference database, `smalloffice_sample_tenant`, via `CREATE TABLE \`x\` LIKE smalloffice_sample_tenant.x;`. Whenever a schema change adds a **new table**, add a matching `LIKE` line here (existing tables don't need an entry — `LIKE` always clones the table's current live structure, so column-level `ALTER`s to existing tables need no change here).

Because `LIKE` reads structure off `smalloffice_sample_tenant`, that specific database must also receive the `CREATE TABLE`/`ALTER TABLE`, not just the regular tenant databases — otherwise new company signups fail.

Full checklist for a schema change:
1. Sequelize migration file under `migration/{master,tenant}/migrations/`.
2. Entry in `alter.txt`.
3. Apply the SQL to `smalloffice_sample_tenant` (so new companies get it) and to existing tenant DBs as needed.
4. If a new table was added, add its `LIKE` line to `new_company_creation_sql/SQL/create-company/create_company_copy.sql`.
5. Before hardcoding a row `id` (e.g. `a_application_pages`, `plan_vs_pages`), check the real target server's DB, not just local — local can be missing rows the live server already has, and inserting at "the next free id locally" can collide with something already live.

## Dev server auto-deploy

Pushing to `dev` on this repo (or `deskflowcrmfrontend`) auto-deploys to `demobackend.smalloffice.in` / `demo.smalloffice.in` via a GitHub webhook (`src/routes/webhook/githubDeployWebhookRouter.js`) that runs `scripts/deploy-dev.sh` on the server. Full details, one-time setup, and gotchas are in `README.MD` — key points:

- Workflow: branch off `dev` → commit → `git push origin <branch>` → fast-forward `dev` when ready: `git push origin <branch>:dev`.
- The dev server runs pending master+tenant migrations automatically on deploy, but `deploy-dev.sh` has no `set -e` — a failing migration does **not** fail the deploy or surface anywhere obvious. After a schema-change deploy, manually re-run and read the output:
  ```
  cd /var/www/demobackend.smalloffice.in
  NODE_ENV=DEMO node src/scripts/runMigrations.js master migration up
  NODE_ENV=DEMO node src/scripts/runMigrations.js master status
  ```
- Frontend `npm run build` OOM-crashes on the dev server — frontend builds happen locally and get committed into `build/` (see `README.MD` in the frontend repo).
- `deploy-dev.sh` uses `git reset --hard origin/dev` — never hand-edit tracked files directly on the dev server.
