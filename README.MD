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
3. `deploy-dev.sh` does, for whichever app changed: `git fetch` + `git reset --hard origin/dev` → `npm install` → (backend only) run pending master+tenant migrations → `pm2 restart <app>`. Logs to `backend/logs/deploy-dev.log`.

## One-time server setup (Ubuntu 24.04, on `demobackend.smalloffice.in`)

1. **Generate a webhook secret** (any random string), e.g.:
   ```
   openssl rand -hex 20
   ```
2. **Add it to the backend's env file** on the server (`.env.development` or whichever `NODE_ENV` file the running process loads):
   ```
   GITHUB_WEBHOOK_SECRET=<the secret from step 1>
   ```
   Restart the backend once (`pm2 restart <backend-app-name>`) after adding it.
3. **Set the pm2 process names** — `scripts/deploy-dev.sh` already defaults to the real server paths (`BACKEND_DIR=/var/www/demobackend.smalloffice.in`, `FRONTEND_DIR=/var/www/demo.smalloffice.in`), but the pm2 process names are still placeholders. Either edit the top of `scripts/deploy-dev.sh` directly:
   ```
   PM2_BACKEND_NAME=<pm2 process name for backend>
   PM2_FRONTEND_NAME=<pm2 process name for frontend>
   ```
   or export `PM2_BACKEND_NAME` / `PM2_FRONTEND_NAME` (and `BACKEND_DIR` / `FRONTEND_DIR` if they ever differ) as env vars before starting the backend process — the script reads from the environment first, falling back to the defaults above.
4. **Make sure the script is executable**: `chmod +x scripts/deploy-dev.sh` (already committed with the executable bit set, but re-check after any manual edit).
5. **Make sure the deploy user can run `git`, `npm`, and `pm2` without a password prompt** — the backend process (running as whatever user runs `pm2`) needs write access to both repo directories and permission to run `pm2 restart`.

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
