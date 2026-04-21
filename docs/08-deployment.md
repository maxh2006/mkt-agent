# 08-deployment.md

Operational / deployment runbook.

---

## Production target

- Host: GCP Compute Engine VM (external IP `34.92.70.250`, project
  `mktagent-493404`, zone `asia-east2-c`)
- App path: `/opt/mkt-agent`
- Deploy script: `scripts/deploy.sh` (run on the server as root)
- Env file: `/opt/mkt-agent/.env` (see `.env.production.example` for shape)
- Process manager: PM2 (`mkt-agent`), fronted by Nginx
- Public URL: `https://<your-domain>` (Nginx terminates TLS; app listens on
  localhost:3000)

For dev/deploy steps see `scripts/deploy.sh` and `scripts/server-setup.sh`.

---

## Deploy ownership model

**Everything runs as root** — `/opt/mkt-agent`, the PM2 god daemon, and
`/opt/mkt-agent/.env` are all owned by `root:root`. This is intentional
and matches where PM2 actually lives (`/root/.pm2`). Keeping filesystem
ownership aligned with the process manager avoids two-user dances, is
the simplest stable model for this single-VM deployment, and sidesteps
git's `detected dubious ownership` guard.

**Canonical commands**

| Action                | Command                                                  |
|-----------------------|----------------------------------------------------------|
| Deploy                | `sudo bash /opt/mkt-agent/scripts/deploy.sh`             |
| Tail app logs         | `sudo pm2 logs mkt-agent`                                |
| Restart only          | `sudo pm2 restart mkt-agent --update-env`                |
| Status                | `sudo pm2 status`                                        |

`scripts/deploy.sh` enforces this: it exits immediately with a helpful
error if run without root, and self-heals ownership (`chown -R root:root`)
if the tree ever drifts back to a non-root owner.

### One-time cleanup — if the VM drifted to non-root ownership

Historically `/opt/mkt-agent` was cloned as a non-root user (e.g. `max`),
which caused `sudo bash scripts/deploy.sh` to fail at `git pull` with
"fatal: detected dubious ownership". To bring a VM back to the canonical
model, run these four commands once (all idempotent; safe to re-run):

```bash
# 1. Take ownership of the repo tree
sudo chown -R root:root /opt/mkt-agent

# 2. Lock down the env file so only root (and the runtime) can read it
sudo chmod 600 /opt/mkt-agent/.env

# 3. Kill stale user-scoped PM2 daemons (leftovers; not running prod)
sudo pkill -f "/home/max/.pm2"  2>/dev/null || true
sudo pkill -f "/home/moloh/.pm2" 2>/dev/null || true

# 4. Sanity-check: root's PM2 still has mkt-agent online
sudo pm2 status
```

After this, deploy is always:

```bash
sudo bash /opt/mkt-agent/scripts/deploy.sh
```

---

## GCP Cloud Scheduler — dispatcher trigger

The Manus dispatcher (`src/lib/manus/dispatcher.ts`) is a *pull* worker: it
claims due `PostPlatformDelivery` rows and hands them to Manus. In production
it must be invoked on a cadence. We use GCP Cloud Scheduler to POST the
trigger route on a schedule.

### Current dev configuration (2026-04-21)

The scheduler job `mkt-agent-dispatch` is live in `asia-east2`, firing every
2 minutes against `http://34.92.70.250/api/jobs/dispatch` (raw HTTP via the
VM's public IP). This is a dev-phase trade-off — the dispatch secret travels
in clear text in the `x-dispatch-secret` header. Acceptable while
`MANUS_AGENT_ENDPOINT` is unset (dispatcher is in dry-run mode), but **before
real Manus traffic**: add a domain (Cloudflare proxy or Let's Encrypt),
switch the target URL to HTTPS, rotate the secret, and
`gcloud scheduler jobs update http --update-headers` / `--uri` on the
scheduler. No app code changes required.

### Scheduler contract

| Field         | Value                                                                 |
|---------------|-----------------------------------------------------------------------|
| HTTP method   | `POST`                                                                |
| Target URL    | `https://<your-domain>/api/jobs/dispatch`                             |
| Headers       | `x-dispatch-secret: <MANUS_DISPATCH_SECRET>` (same value as in app `.env`) |
| Body          | (empty)                                                               |
| Frequency     | `*/2 * * * *` (every 2 minutes) — recommended default                 |
| Timezone      | `Asia/Manila` (matches platform operational timezone)                 |
| Attempt deadline | 60s (dispatcher pass is fast; long tail = a handoff HTTP to Manus) |
| Retry         | Leave defaults — CS retries 5xx automatically; 401 does NOT retry    |

The secret header is the only auth — the route is excluded from session
middleware (see `src/proxy.ts` matcher) so it accepts Cloud Scheduler's
anonymous requests as long as the secret matches.

Frequency can be tuned 1–5 minutes. `*/2` is the default: a scheduled post's
worst-case latency between `scheduled_at` and Manus handoff is ~2 minutes.

### Create the scheduler job (gcloud)

Run once from a workstation with `gcloud` authenticated to
`mktagent-493404`. Replace `<your-domain>` and keep the secret out of shell
history (use a variable sourced from a local `.env` or a password manager).

```bash
# one-time: pull the secret into a shell variable (or read from your vault)
DISPATCH_SECRET="$(cat ~/.mkt-agent/dispatch-secret)"

gcloud scheduler jobs create http mkt-agent-dispatch \
  --project=mktagent-493404 \
  --location=asia-east2 \
  --schedule="*/2 * * * *" \
  --time-zone="Asia/Manila" \
  --uri="https://<your-domain>/api/jobs/dispatch" \
  --http-method=POST \
  --headers="x-dispatch-secret=${DISPATCH_SECRET}" \
  --attempt-deadline=60s \
  --description="Mkt-agent Manus dispatcher — claims due deliveries and hands them to Manus."
```

To rotate the secret later: update `.env` on the server + restart PM2, then:

```bash
gcloud scheduler jobs update http mkt-agent-dispatch \
  --project=mktagent-493404 \
  --location=asia-east2 \
  --update-headers="x-dispatch-secret=${NEW_DISPATCH_SECRET}"
```

### Required before enabling the scheduler

1. `MANUS_DISPATCH_SECRET` is set in `/opt/mkt-agent/.env`. Generate with
   `openssl rand -base64 32`.
2. The app is reachable at the target URL with a valid TLS cert (Nginx +
   Let's Encrypt).
3. PM2 is running (`pm2 status` shows `mkt-agent` online).
4. Manual smoke test succeeds (see next section).

### Manual smoke test

From any machine with the secret:

```bash
curl -sS -X POST https://<your-domain>/api/jobs/dispatch \
  -H "x-dispatch-secret: ${DISPATCH_SECRET}" \
  -H "content-type: application/json" \
  -d '{}'
```

Expected response shape on success (HTTP 200):

```json
{
  "data": {
    "picked":     0,
    "claimed":    0,
    "dispatched": 0,
    "errors":     [],
    "dry_run":    true
  }
}
```

Semantics:
- `picked` / `claimed` — rows selected + transitioned to `publishing` in this
  pass (they match 1:1 because the claim is a single atomic UPDATE)
- `dispatched` — handoffs to Manus that were accepted (or accepted in
  dry-run mode)
- `errors` — per-delivery handoff errors (does NOT include rows that were
  never claimed)
- `dry_run` — `true` when `MANUS_AGENT_ENDPOINT` is unset. In dry-run the
  payload is logged but no external HTTP call is made. This is the expected
  production state until the Manus endpoint is wired in.

Other response codes:
- `401` — missing or wrong `x-dispatch-secret` header
- `503` — `MANUS_DISPATCH_SECRET` is not configured on the server (CS will
  retry automatically; the job heals once the env var is set + PM2 restarted)
- `5xx` — unhandled dispatcher error (rare; CS retries)

### Verification after enabling the scheduler

Pick one:

1. **Cloud Console** — `Cloud Scheduler → Jobs → mkt-agent-dispatch` →
   "View logs" / "Force run". The job status should show `SUCCESS` with a
   JSON response body matching the shape above.

2. **PM2 logs on the server** — one line per dispatcher pass:
   ```
   [manus-dispatcher] claimed=N batch=25
   ```
   plus one line per dispatched delivery when `N > 0`.

3. **End-to-end** — approve a post with `scheduled_at = now()`, wait up to
   `*/2` minutes, then inspect `post_platform_deliveries` — the row should
   have moved from `queued` → `publishing` and `publish_requested_at` set.

### Pausing / disabling

```bash
gcloud scheduler jobs pause  mkt-agent-dispatch --project=mktagent-493404 --location=asia-east2
gcloud scheduler jobs resume mkt-agent-dispatch --project=mktagent-493404 --location=asia-east2
```

Paused jobs retain their config; no need to recreate on resume. Pausing is
safe — queued deliveries simply wait until dispatcher passes resume.

---

## Env vars checklist (prod)

Must be set in `/opt/mkt-agent/.env` before Cloud Scheduler is enabled:

- `DATABASE_URL` — Postgres connection string
- `AUTH_SECRET` — NextAuth session secret
- `AUTH_TRUST_HOST=true`
- `NODE_ENV=production`
- `MANUS_DISPATCH_SECRET` — shared secret the scheduler sends
- `MANUS_WEBHOOK_SECRET` — shared secret Manus signs callbacks with (if
  Manus integration is live; otherwise optional, callback route will 503)
- `MANUS_AGENT_ENDPOINT` — Manus agent URL. If unset, the dispatcher runs
  in dry-run mode (safe default)
- `MANUS_API_KEY` — bearer token for Manus (optional)

Restart PM2 after any env change:
```bash
pm2 restart mkt-agent
```
