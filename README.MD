# CRONE TAB URL

# CRONE TAB URL

``PowerShell

- IndiaMart Cron Tab

_/15 _ \* \* \* /usr/bin/curl -s -X POST "https://backend.smalloffice.in/api/india-mart-crone-tab" \ -H "crone_tab_privacy: khHKgIG786IG87ig878G8g8" \ >/dev/null 2>&1

- Trade India Cron Tab

_/15 _ \* \* \* /usr/bin/curl -s -X POST "https://backend.smalloffice.in/api/trade-india-crone-tab" \ -H "crone_tab_privacy: khHKgIG786IG87ig878G8g8" \ >/dev/null 2>&1

- Trade India Buy Leads Cron Tab

_/15 _ \* \* \* /usr/bin/curl -s -X POST "https://backend.smalloffice.in/api/trade-india-buy-leads-crone-tab" \ -H "crone_tab_privacy: khHKgIG786IG87ig878G8g8" \ >/dev/null 2>&1

- Google Sheets Cron Tab

_/15 _ \* \* \* /usr/bin/curl -s -X POST "https://backend.smalloffice.in/api/google-sheets-crone-tab" \ -H "crone_tab_privacy: khHKgIG786IG87ig878G8g8" \ >/dev/null 2>&1`

# Tenant Schema Drift Check

Compares every tenant DB's table/column structure (read from `tenant_masters` in the master DB) against the reference DB `smalloffice_sample_tenant`, and reports missing tables, missing columns, column type mismatches, and extra tables. Read-only — only runs `information_schema.columns` queries, never modifies any DB.

Run:

```
npm run check:tenant:schema-drift
```

Optional args (positional, both optional):

```
node src/scripts/checkTenantSchemaDrift.js <referenceDbName> <concurrency>
```

- `referenceDbName` — defaults to `smalloffice_sample_tenant`.
- `concurrency` — how many tenant DBs to check in parallel, defaults to `5`.

Uses `.env.development` (set `NODE_ENV=production` before running to use `.env.production` instead, e.g. `cross-env NODE_ENV=production node src/scripts/checkTenantSchemaDrift.js`).

Output: prints progress to console and writes a full report to `tenant_schema_diff_report_<timestamp>.txt` in the backend root (gitignored — don't commit these).

# Dev Server Auto-Deploy (GitHub Webhook)

Pushing to `dev` on either `deskflowcrmbackend` or `deskflowcrmfrontend` auto-deploys to the dev server (`demobackend.smalloffice.in` / `demo.smalloffice.in`) via a GitHub webhook that hits a route on the backend, which then pulls + restarts the right app.

Free — no paid GitHub plan needed, webhooks work on every plan/repo visibility.

## How it works

1. GitHub sends a `push` event to `POST https://demobackend.smalloffice.in/webhook/github-dev-deploy` on every push (any branch).
2. The route (`src/routes/webhook/githubDeployWebhookRouter.js`) verifies the request really came from GitHub via the `X-Hub-Signature-256` header (HMAC-SHA256 with a shared secret), ignores anything that isn't a push to `refs/heads/dev`, then runs `scripts/deploy-dev.sh <backend|frontend>` in the background (immediately returns 200 so GitHub doesn't time out).
3. `deploy-dev.sh` does `git fetch` + `git reset --hard origin/dev`, then:
   - **backend**: `npm install` (only if `package-lock.json` changed — see the gotcha below) → runs pending master+tenant migrations (`NODE_ENV=DEMO`) → `pm2 restart deskflowcrm-backend`.
   - **frontend**: nothing else — the server used to run `npm run build` here, but that OOM-crashed (webpack + `@pdfme/*` needs more RAM than the box has). The build now happens on a developer's own machine and gets committed straight into `build/` (see "Frontend builds happen locally now" below); the server's `git reset --hard` just picks up whatever `build/` was last committed to `dev`. No restart needed either way — nginx's `root` points at `demo.smalloffice.in/build`.

   Logs to `backend/logs/deploy-dev.log`.

Backend runs as `NODE_ENV=DEMO` (its own `.env.DEMO`, not `.env.development`) via pm2:
```
pm2 start "npx cross-env NODE_ENV=DEMO tsx src/index.js" --name deskflowcrm-backend
```
(`cross-env` is used because `NODE_ENV=DEMO pm2 start ...` alone does **not** reliably pass the var into the process pm2 spawns.)

Frontend has no pm2 process at all — it's a static build served by nginx directly from `/var/www/demo.smalloffice.in/build`.

## One-time server setup (Ubuntu 24.04, on `demobackend.smalloffice.in`)

1. **Generate a webhook secret** (any random string), e.g.:
   ```
   openssl rand -hex 20
   ```
2. **Add it to `backend/.env.DEMO`** on the server:
   ```
   GITHUB_WEBHOOK_SECRET=<the secret from step 1>
   ```
   Restart the backend once (`pm2 restart deskflowcrm-backend`) after adding it.
3. **Confirm the paths/pm2 name in `scripts/deploy-dev.sh`** match reality — they default to `BACKEND_DIR=/var/www/demobackend.smalloffice.in`, `FRONTEND_DIR=/var/www/demo.smalloffice.in`, `PM2_BACKEND_NAME=deskflowcrm-backend`, `BACKEND_NODE_ENV=DEMO`. Override any of them via env vars before starting the backend process if they ever change, instead of editing the script.
4. **Make sure the script is executable**: `chmod +x scripts/deploy-dev.sh` (already committed with the executable bit set, but re-check after any manual edit).
5. **Make sure the deploy user can run `git`, `npm`, and `pm2` without a password prompt** — the backend process (running as whatever user runs `pm2`, currently `root`) needs write access to both repo directories and permission to run `pm2 restart`.

## GitHub webhook setup (do this once per repo — both `deskflowcrmbackend` and `deskflowcrmfrontend`)

1. Open the repo on GitHub → **Settings** → **Webhooks** → **Add webhook**.
2. **Payload URL**: `https://demobackend.smalloffice.in/webhook/github-dev-deploy`
3. **Content type**: `application/json`
4. **Secret**: the same value you put in `GITHUB_WEBHOOK_SECRET` on the server.
5. **Which events**: "Just the push event" (default).
6. Save. GitHub will send a test ping — check `backend/logs/deploy-dev.log` and the webhook's "Recent Deliveries" tab on GitHub to confirm it reached the server (ping events aren't pushes, so no deploy runs, but a 200 response confirms connectivity).

## Testing it

Push a trivial commit to `dev` on either repo and check `backend/logs/deploy-dev.log` on the server — you should see a "Backend/Frontend deploy start" → "... done" pair within a few seconds, and `pm2 list` should show a recent restart on the relevant process.

## Notes / things to double check on the server

- The route only matches `req.body.repository.name` of `deskflowcrmbackend` or `deskflowcrmfrontend` (from `REPO_TO_APP` in the router file) — if the GitHub repo is named differently on your account, update that mapping.
- `git reset --hard origin/dev` is used instead of `git pull` so a script re-run always converges to exactly what's on `dev`, even if something odd happened to the working tree — it does **not** touch untracked files (so a local, gitignored `.env.development` on the server is safe), but it **will discard any uncommitted tracked-file edits** in that repo on the server, so don't hand-edit tracked files directly on the dev server.
- Only `dev` branch pushes trigger a deploy; everything else gets a 200 + ignored, so this is safe to leave on permanently.

## Frontend builds happen locally now

`npm run build` on the dev server OOM-crashes (webpack + `@pdfme/*` needs more RAM than that box has). Build on your own machine instead and commit the result:

```
cd frontend           # the frontend repo, on the branch you're deploying
scripts/deploy-dev-local-build.sh demo         # dev/demo server
scripts/deploy-dev-local-build.sh production   # prod server (fill in scripts/deploy-targets/production.env first)
```

This runs `npm run build` locally, commits the built `build/` folder, and pushes — the server's webhook then just `git reset --hard`s the committed `build/` in, no build step needed there. `build/` is intentionally tracked in this repo (not gitignored) for exactly this reason.

Each target's `.env` file (which CRA env values to build with) lives in `scripts/deploy-targets/<name>.env` and points at a machine-local, gitignored `.env.demo` / `.env.production` file — those hold real per-server values (API endpoints, keys) and must never be committed. If one doesn't exist yet, pull the real values off the server once: `ssh <server> cat <app-dir>/.env.production > .env.demo` (or `.env.production`), then reuse it for future builds.

## Submitting changes to `dev` (for future sessions)

This is a 3-repo project (`deskflowcrmbackend`, `deskflowcrmfrontend`, `deskflowadminpanel`) and `dev` auto-deploys per-repo as described above. The workflow that's worked this session, repeated per repo you touched:

1. Work on a feature branch (a git worktree checked out from `dev` is fine — see `EnterWorktree`). Commit as you go.
2. `git push origin <your-branch>` — publishes your branch, doesn't touch `dev`.
3. Fast-forward `dev` once you're ready to actually deploy: `git push origin <your-branch>:dev`. This only works cleanly if `dev` hasn't moved since you branched — `git fetch origin dev && git merge origin/dev` first if it has (or just re-branch).
4. **Schema changes**: migration file under `migration/{master,tenant}/migrations/` + an entry in `alter.txt`, per the checklist at the top of this repo's `CLAUDE.md`. The dev server runs pending master+tenant migrations automatically on every backend deploy (`NODE_ENV=DEMO node src/scripts/runMigrations.js master migration up`, same for tenant) — but there's **no `set -e` in `deploy-dev.sh`**, so a failing migration does NOT fail the deploy or show up as an error anywhere obvious. Always manually re-run the migration command on the server after a schema-change deploy and read its actual output:
   ```
   cd /var/www/demobackend.smalloffice.in
   NODE_ENV=DEMO node src/scripts/runMigrations.js master migration up
   NODE_ENV=DEMO node src/scripts/runMigrations.js master status
   ```
5. **Frontend changes**: after step 3 lands on `dev`, also run the local build + push (see above) — pushing source alone does not update the live site.

### Gotchas hit this session (read before adding a new `a_application_pages` row)

- **Hardcoded IDs must be checked against the real server, not your local dev DB.** `a_application_pages`/`plan_vs_pages` rows are usually inserted with an explicit `id` (not `NULL`) so the frontend's `PAGE_ID` enum (`src/helpers/AppEnum.ts` in the frontend repo) can reference a fixed number. Your local `smalloffice` DB can be missing rows that already exist on the real server (e.g. an entire batch of AdminPanel entitlement pages existed on the demo server's DB but not locally) — inserting at "the next free id locally" can collide with something already live and throw a validation/duplicate error, or silently insert into the wrong logical slot. Before hardcoding an id, run `SELECT MAX(id) FROM a_application_pages` (and eyeball the surrounding rows) on the actual target server, not just locally.
- **Master migrations need `--env` explicitly.** `src/config/database-master.js` keys its exported config by the real `NODE_ENV` (`development`/`production`/`DEMO`/...), but `sequelize-cli` defaults `--env` to `"development"` when it's not passed. `src/scripts/runMigrations.js` now passes `--env $NODE_ENV` for all master commands — if you ever see `ERROR: Dialect needs to be explicitly supplied as of v4.0.0` running a master migration, this is almost certainly the cause (check the fix wasn't reverted).
- **`.env.development` (and any per-server `.env.*`) is never committed with real/local values.** Check `git status` before every commit/push in this repo — a stray `TENANT_DB_HOST_NAME=localhost` or similar personal override committed to `dev` breaks the shared config for everyone else.
