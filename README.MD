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
3. `deploy-dev.sh` does `git fetch` + `git reset --hard origin/dev` → `npm install`, then:
   - **backend**: runs pending master+tenant migrations (`NODE_ENV=DEMO`) → `pm2 restart deskflowcrm-backend`.
   - **frontend**: `npm run build` (no restart needed — nginx's `root` points at `demo.smalloffice.in/build`, serving the fresh build directly on the next request).

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
