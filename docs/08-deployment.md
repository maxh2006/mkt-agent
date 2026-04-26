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

## AI provider toggle (safe prod rollback)

The AI text-generation provider is env-switched at
`src/lib/ai/client.ts` — no code path is hard-wired. This is the
escape hatch if the Anthropic account hits a billing / rate-limit /
outage wall: flip back to `stub` in 60 seconds without any code
change or deploy.

**Current prod provider** (as of 2026-04-22): `stub` — dormant
Anthropic envs left in place pending credit purchase. See WORKLOG
entry 2026-04-22 for context.

### To flip to Anthropic (once credits are active)

```bash
# Flip the single env line
sudo sed -i 's/^AI_PROVIDER=.*/AI_PROVIDER=anthropic/' /opt/mkt-agent/.env

# PM2 must re-read env on restart
sudo pm2 restart mkt-agent --update-env

# Verify credits unlocked (Anthropic's lowest-privilege endpoint)
KEY=$(sudo grep ^ANTHROPIC_API_KEY /opt/mkt-agent/.env | cut -d= -f2-)
curl -sS -w "\nhttp_code=%{http_code}\n" https://api.anthropic.com/v1/models \
  -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" | head -20
# 200 → proceed; 403 "Request not allowed" → credits not yet propagated, retry
```

### To flip back to stub

```bash
sudo sed -i 's/^AI_PROVIDER=.*/AI_PROVIDER=stub/' /opt/mkt-agent/.env
sudo pm2 restart mkt-agent --update-env
```

---

## Image generation provider — Gemini / Nano Banana 2

The background-image provider boundary at `src/lib/ai/image/client.ts`
ships with a stub default and a real Gemini adapter
(`src/lib/ai/image/gemini.ts`). The Gemini adapter calls the
**Nano Banana 2** model — developer model id
`gemini-3.1-flash-image-preview` — via the Google AI Studio Gemini API.
This section documents the EXACT auth path so we don't repeat the
"wired but unusable" failure mode we hit with Anthropic credits.

**Current prod provider** (as of 2026-04-27): `stub` — Gemini adapter
shipped but not yet activated in prod env. The flip procedure is
identical in shape to the AI_PROVIDER=anthropic flip above.

### Auth path (READ FIRST — this is the part that bites)

The Gemini API uses **API-key auth only** in this codebase. We do NOT
use Vertex AI / ADC for image generation — too much GCP setup for a
model served identically from the simpler Gemini API endpoint.

Required env vars:
- `AI_IMAGE_PROVIDER=gemini` — selects the adapter
- `GEMINI_API_KEY` — required; fails loud on absence with no silent
  stub fallback
- `AI_IMAGE_MODEL` — optional; defaults to
  `gemini-3.1-flash-image-preview`

Where to get the key: **Google AI Studio** at
https://aistudio.google.com/apikey. Pick "Create API key" → choose an
existing GCP project or create a new one.

**CRITICAL — billing requirement.** The GCP project the key is linked
to MUST have billing enabled. Without billing:
- low free-tier quota (a few requests/minute) — fine for a single
  manual smoke test
- production-volume traffic returns `403 PERMISSION_DENIED` or
  `429 RESOURCE_EXHAUSTED`
- the adapter classifies these as `AUTH_ERROR` / `RATE_LIMITED`
  respectively and persists them in `image_generation.error_code`

**To enable billing for your linked project:**
1. Go to https://console.cloud.google.com/billing → Manage billing accounts
2. Link a billing account to the project that owns your Gemini API key
3. Enable the "Generative Language API" on that project at
   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com

Anthropic gotcha note: the equivalent failure for Claude is `403
Request not allowed` when the account is on Evaluation tier. Gemini's
equivalent is the `403 PERMISSION_DENIED` / `429 RESOURCE_EXHAUSTED`
combo. Same shape, different vendor — verify billing BEFORE flipping
the prod env.

### To flip image generation to Gemini in prod

```bash
# 1. Put the key into the prod env file (root-only readable)
sudo bash -c 'echo "GEMINI_API_KEY=YOUR_KEY_HERE" >> /opt/mkt-agent/.env'
# (or edit /opt/mkt-agent/.env directly with $EDITOR if you prefer)

# 2. Flip the provider switch
sudo sed -i 's/^AI_IMAGE_PROVIDER=.*/AI_IMAGE_PROVIDER=gemini/' /opt/mkt-agent/.env

# 3. PM2 must re-read env on restart
sudo pm2 restart mkt-agent --update-env

# 4. Verify the key works against Gemini's lowest-privilege endpoint.
#    A successful list-models call confirms billing + key are good.
KEY=$(sudo grep ^GEMINI_API_KEY /opt/mkt-agent/.env | cut -d= -f2-)
curl -sS -w "\nhttp_code=%{http_code}\n" \
  -H "x-goog-api-key: $KEY" \
  "https://generativelanguage.googleapis.com/v1beta/models" | head -30
# 200 → proceed; 403 with "PERMISSION_DENIED" → billing not enabled
# on the linked project; 401 → bad key.
```

### To flip back to stub

```bash
sudo sed -i 's/^AI_IMAGE_PROVIDER=.*/AI_IMAGE_PROVIDER=stub/' /opt/mkt-agent/.env
sudo pm2 restart mkt-agent --update-env
```

### What the adapter does + does NOT do

- Generates a BACKGROUND image only. The "Absolutely no text in image"
  rule from the visual compiler is reinforced in the prompt and via
  the negative prompt list.
- Returns the inline base64 image bytes encoded as a `data:image/png;base64,…`
  URI in `Post.generation_context_json.image_generation.artifact_url`.
  This is the smallest clean MVP persistence path — when generation
  volume warrants, migrate to GCS-backed `https://…` URLs (the schema
  field stays the same).
- **Does NOT touch `Post.image_url`.** That field stays reserved for
  the FINAL composited image the deferred deterministic overlay
  renderer will produce. The Gemini-only background must NEVER be
  shipped to Manus as the final creative.
- Failures (network / 4xx / 5xx / blocked content) are caught by the
  orchestrator's try/catch in `src/lib/ai/generate.ts` — the run
  always inserts text drafts; image failure shows up as
  `image_generation.status: "error"` with a normalized
  `error_code` from the canonical taxonomy
  (`NETWORK_ERROR` / `AUTH_ERROR` / `RATE_LIMITED` / `INVALID_PROMPT` /
  `POLICY_REJECTED` / `TEMPORARY_UPSTREAM` / `UNKNOWN`).

### Common errors + meanings

| HTTP | Adapter `error_code` | Likely cause |
|---|---|---|
| 400 | `INVALID_PROMPT` | Malformed payload (we should never hit this — fix the request shape) |
| 400 + body mentions "safety/policy/blocked" | `POLICY_REJECTED` | Gemini content policy refused the prompt |
| 401 | `AUTH_ERROR` | API key is invalid / revoked / wrong project |
| 403 + body says `PERMISSION_DENIED` | `AUTH_ERROR` | Billing not enabled, or "Generative Language API" not enabled on the linked project |
| 429 | `RATE_LIMITED` | Hit free-tier quota OR per-minute production quota |
| 5xx | `TEMPORARY_UPSTREAM` | Transient — operator can retry by re-running generation |
| timeout (60s) | `NETWORK_ERROR` | Provider hung; orchestrator continues |

The above persist into `image_generation` on every affected draft —
operators (or future code) can grep `error_code` across recent
generation_context_json blocks to spot patterns.

---

**What stub does**: `src/lib/ai/client.ts#stubProvider()` returns
deterministic placeholder samples shaped like real Anthropic output
(`headline`, `caption` prefixed with `(STUB sample N of M)`, `cta`,
`banner_text`, `image_prompt`). Drafts still land in Content Queue,
still carry `generation_context_json` metadata, still respect sample
grouping. Marked `provider=stub` and `ai_dry_run=true` in the
metadata so operators can filter them out. **Zero external API
calls, zero cost.** Safe to leave in prod indefinitely while any
provider-side issue is being resolved.

`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` can stay in `/opt/mkt-agent/.env`
while `AI_PROVIDER=stub` — the code only reads them when the provider
switch selects the `anthropic` case. No cost, no side effect.

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
