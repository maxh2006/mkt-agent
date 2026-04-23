# 00-architecture.md

## System Overview

Build a multi-brand social media automation dashboard.

The system has four core layers:
1. operator dashboard
2. backend business logic
3. database and event storage
4. AI content generation layer

The dashboard is the control center.
The backend computes all facts.
The database stores source truth and rollups.
The AI layer only generates copy and creative output from structured packets.

---

## Core Modules

### 1. Brand Context
Every major entity belongs to a brand.
Use `brand_id` everywhere it matters.

### 2. Content Operations
Handles:
- posts
- content queue
- preview/edit/approve/schedule
- post status lifecycle

### 3. Events / Campaign Briefs
Handles adhoc campaigns like Top Fans and seasonal activities.
Events are structured AI-ready campaign briefs with target audience, tone, CTA, platform scope, and AI notes.
Supports posting schedule configuration with daily/weekly/monthly recurrence.
Events can generate draft posts in the content queue for human review.
Event statuses: active → ended → archived (lifecycle-managed).

### 4. Automations
Handles rule configuration for promo posts, big wins, educational posts, and later hot games.

### 5. Channels
Stores per-brand social platform connections and publishing targets.

### 6. Tracking and Insights
Stores click, signup, deposit, and revenue attribution from tracked links.
Provides lightweight internal insights.

### 7. AI Generation
Consumes structured packets and returns captions, banner text, and variants.

---

## High-Level Architecture

### Frontend
Next.js app for operator dashboard.

### Backend
Modular monolith in TypeScript.
Use route handlers or server actions where appropriate.
Keep logic grouped by domain:
- brands
- posts
- events
- automations
- channels
- insights
- auth

### Database
PostgreSQL with Prisma.

### Publishing — Manus worker
Manus is the external auto-publishing worker. Responsibilities split:

Backoffice (this app):
- source of truth for drafts
- review / refine / reject / approve / schedule
- queue + calendar visibility
- delivery visibility (per-platform status surfaced via delivery modal)
- source/rule context shown to operator

Manus:
- receives publish jobs from approved/scheduled posts
- posts to external platforms (Meta, Telegram, more later)
- returns success/failure per platform
- retries when requested
- reports platform-level outcomes back

Retries happen at the **platform delivery level** and resend the same approved
content payload — retry does NOT regenerate content, re-run automation source logic,
or require re-approval.

**MVP policy — no refine-after-approval.** Once a post is approved and enters
the delivery lifecycle (`scheduled` / `publishing` / `posted` / `partial` /
`failed`) its content is locked. Refinement is available only in review-side
states (`draft` / `pending_approval` / `rejected`). Because content cannot
mutate after approval, the dispatcher safely reads live Post fields at
dispatch time and on retry — approved-payload snapshotting is not required
under this policy. There is no Return to Review flow in MVP.

Visible post lifecycle (operational):
Draft → Pending Approval → Scheduled → Publishing → Posted / Partial / Failed.
Rejected is a terminal path from Pending Approval.
Approved is metadata only (`approved_at`, `approved_by`) — not a long-lived
operational status.

### Delivery rows — creation path
`PostPlatformDelivery` rows are created when a post enters the delivery
lifecycle (approve / schedule). The helper
`src/lib/manus/delivery-creator.ts#ensureDeliveriesForPost()` is called from:
- `POST /api/posts/[id]/approve` — after the post transitions to `scheduled`
- `POST /api/posts/[id]/schedule` — when an operator explicitly schedules

One delivery per `(post_id, post.platform)`. Multi-platform campaigns are
modeled as multiple posts (e.g. event draft generation creates one post per
occurrence × platform), so a single delivery row per post matches the data
model. Idempotent via the `@@unique([post_id, platform])` constraint plus
`createMany({ skipDuplicates: true })` — re-calling approve/schedule never
duplicates deliveries.

Initial delivery status:
- `scheduled_for <= now` → `status = 'queued'` (eligible on next dispatcher pass)
- `scheduled_for > now`  → `status = 'scheduled'` (waiting for publish time)

### Dispatcher
`src/lib/manus/dispatcher.ts` is the worker-side entry point that hands due
deliveries to Manus. Triggered by POST `/api/jobs/dispatch` (secret-gated via
`MANUS_DISPATCH_SECRET` header). A single call:

1. Runs one atomic SQL statement that selects deliveries with
   `status IN ('queued','scheduled') AND scheduled_for <= now()`, locks them
   with `FOR UPDATE SKIP LOCKED`, marks them `publishing`, sets
   `publish_requested_at`, and returns the claimed rows. Safe against
   concurrent dispatchers. Future-dated `scheduled` rows become eligible the
   moment `scheduled_for` passes and transition directly to `publishing`.
2. Loads the parent posts in a single batch query (no N+1).
3. Builds a `ManusDispatchPayload` per claimed delivery from the approved
   post fields (no regeneration, no re-approval, no source re-run). The
   payload carries both a flat `content` block (backward-safe) AND a
   platform-shaped `publish_payload` produced by
   [`buildPublishPayload()`](../src/lib/manus/platform-payload.ts) — see
   "Manus platform payload mapping" below.
4. Hands each payload to `dispatchToManus()` at `src/lib/manus/client.ts`.

The Manus client is a thin, replaceable boundary. If `MANUS_AGENT_ENDPOINT` is
unset it runs in **dry-run mode** (logs payload, returns accepted). Otherwise it
POSTs the payload with optional `MANUS_API_KEY` as a bearer token.

Per-platform delivery results come back asynchronously via the callback route
(see next subsection). `post_id` and `delivery_id` are the stable correlation
keys Manus must echo back.

Retry reuses the same picker: the retry endpoint
(`POST /api/posts/[id]/deliveries/[platform]/retry`) resets the failed
delivery to `queued` with `scheduled_for = now()`, bumps `retry_count`, clears
`last_error`, and writes a `delivery.retried` audit entry. Cloud Scheduler
picks it up automatically on the next dispatcher tick (every 2 min in prod).
No regeneration, no re-approval.

Scheduled invocation in production: GCP Cloud Scheduler POSTs the dispatch
route every 2 minutes with `x-dispatch-secret: <MANUS_DISPATCH_SECRET>`. Setup,
verification, and rotation commands live in `docs/08-deployment.md`. The route
returns 503 when the secret is unconfigured (Cloud Scheduler retries 5xx
automatically, so the job self-heals once the env var is set).

### Callback / webhook
`POST /api/manus/callback` receives per-platform publish outcomes from Manus.
The route is excluded from session middleware (see `src/proxy.ts`) and
authenticates with HMAC-SHA256 over the raw request body.

Contract:
- Header: `x-manus-signature: sha256=<hex>` — HMAC-SHA256 of the raw body
  keyed by `MANUS_WEBHOOK_SECRET`. Verified constant-time.
- Body (single outcome per request):
  ```
  { delivery_id, post_id?, platform?, outcome: "posted" | "failed",
    external_post_id?, error?, error_code?, external_ref?, attempted_at? }
  ```
- `delivery_id` is the primary correlation key; `post_id` and `platform` are
  validated when present and reject on mismatch (409).
- Missing/invalid signature returns 401; missing `MANUS_WEBHOOK_SECRET`
  returns 503 (fail-closed).
- `error_code` is accepted as a free-form string at the Zod boundary so
  unknown taxonomy codes don't reject the callback (forward-compatible).
  Canonical codes live in `ManusErrorCode` — see "Manus protocol — finalized
  contract" below.

Behaviour:
1. Verify signature → parse → validate → look up delivery.
2. Apply the outcome idempotently. Key idempotency rules:
   - `posted + posted` → no-op (fill missing `external_post_id` if provided)
   - `posted + failed` → **refused**; returns 200 with `refused=true` so Manus
     stops retrying. A successful delivery is not regressed by a late failure.
   - `failed + failed` → refresh `last_error` + `publish_attempted_at` only if
     `last_error` changed. `retry_count` is not touched (operator-driven).
   - everything else → full terminal update.
3. Full success update: `status=posted`, `posted_at=attempted_at`,
   `publish_attempted_at ??= attempted_at`, set `external_post_id`, clear
   `last_error`.
4. Full failure update: `status=failed`, `publish_attempted_at=attempted_at`,
   `last_error = "[CODE] message"` when `error_code` is present, otherwise
   `"message"` (falls back to `"Unknown error"` when Manus sends neither).
5. After any state change, reconcile parent Post via
   `reconcilePostStatus()` at `src/lib/manus/reconcile.ts`, which computes the
   aggregate via `computePostStatusFromDeliveries()` and updates
   `Post.status` + `Post.posted_at` when needed. Manus is authoritative for
   outcomes, so invalid status transitions are logged as warnings but still
   applied.

One log line per callback at `info`:
`[manus-callback] delivery=<id> platform=<p> outcome=<o> post=<pid> sig_ok=true idempotent=<b> [refused=true] post_status=<new> [error_code=<C>] [external_ref=<R>]`.

### Manus protocol — finalized contract

This is the complete MVP contract between our app and Manus. All shapes are
stable for Phase 2. Source of truth: `src/lib/manus/types.ts`
(`ManusDispatchPayload`, `ManusDispatchResult`, `ManusCallbackPayload`,
`ManusErrorCode`).

**Dispatch request (our app → Manus).** POST `MANUS_AGENT_ENDPOINT` with
`ManusDispatchPayload`. `Authorization: Bearer ${MANUS_API_KEY}` if configured.

**Dispatch response (Manus → our app, synchronous).**
```
{ accepted: boolean,
  external_ref?: string,   // Manus-side job reference (see below)
  error?: string,          // human-readable, on accepted=false
  error_code?: ManusErrorCode }   // machine-readable class, on accepted=false
```
Non-2xx responses are mapped to `{ accepted: false, error: "...", error_code: ... }`
by `src/lib/manus/client.ts`. Network failures become `error_code: "NETWORK_ERROR"`.
`accepted=true` means Manus took responsibility for the job; actual
platform outcome arrives asynchronously via the callback.

**Callback request (Manus → our app, asynchronous).**
`POST /api/manus/callback` with `ManusCallbackPayload`, HMAC-signed
(`x-manus-signature: sha256=<hex>` keyed by `MANUS_WEBHOOK_SECRET`). See
"Callback / webhook" above for the full contract + behaviour.

**Correlation keys.**
- `delivery_id` — **primary** internal correlation key. Always present,
  always authoritative. Manus MUST echo it back on every callback.
- `post_id` — secondary; validated against the stored delivery on callback
  (409 on mismatch). Helps Manus-side logs.
- `platform` — secondary; validated similarly on callback.
- `external_ref` — **Manus-side job reference** (e.g. Manus's internal
  job id). Returned on the dispatch response; optionally echoed in the
  callback. Used for cross-system log correlation only. NOT persisted to
  `post_platform_deliveries` in MVP — add a column when Manus goes live
  if cross-system correlation becomes necessary.
- `external_post_id` — **platform-side post identifier** (e.g. Facebook
  post URL/id). Set on successful `posted` callbacks. Distinct from
  `external_ref`.

**Error taxonomy (`ManusErrorCode`).** Canonical machine-readable classes:
- `AUTH_ERROR` — Manus could not authenticate to the target platform
- `NETWORK_ERROR` — connection failure or timeout
- `PLATFORM_REJECTED` — platform returned a hard reject (content policy etc.)
- `RATE_LIMITED` — platform throttled the request
- `INVALID_PAYLOAD` — Manus believes our payload is malformed
- `MEDIA_ERROR` — image/video processing or upload failed
- `TEMPORARY_UPSTREAM_ERROR` — transient platform outage; safe to retry later
- `UNKNOWN_ERROR` — fallback for unclassified failures

Manus may send codes outside this list; we accept and log them without
rejecting the callback (forward compat).

**Retryability layer (2026-04-23).** On top of the taxonomy above, each
delivery failure is classified as `retryable` or `fatal` by a pure helper
at [`src/lib/manus/retryability.ts`](../src/lib/manus/retryability.ts).
The classifier is shared by the retry API route (gates retries) and the
Delivery Status modal (shows operator-facing label + hint).

| Code | Class | Reason |
|---|---|---|
| `NETWORK_ERROR` | retryable | transient |
| `RATE_LIMITED` | retryable | transient throttle |
| `TEMPORARY_UPSTREAM_ERROR` | retryable | named transient |
| `AUTH_ERROR` | fatal | fix platform credentials first |
| `INVALID_PAYLOAD` | fatal | fix content/payload first |
| `MEDIA_ERROR` | fatal | fix asset/media first |
| `PLATFORM_REJECTED` | fatal | content violates policy |
| `UNKNOWN_ERROR`, missing code, legacy text-only | retryable (default, labelled "cause unknown") | operator has agency; retry route is role-gated; unknowns are more often transient than policy-rejects |

No DB column for the classification — it's derived from parsing the
`"[CODE] ..."` prefix of stored `last_error`. The derivation is exact
(strict regex + known-code set) so no ambiguity. Backend retry route
returns 422 with a fixed message when a fatal is retried (defence in
depth — UI hides the button too).

**`last_error` storage format.** When `error_code` is provided on a failed
callback, we format the stored string as `"[CODE] human message"`
(e.g. `"[RATE_LIMITED] Meta graph API 429"`). If only `error` is sent the
string is used verbatim. If neither is sent, `"Unknown error"` is stored.
No separate DB column for `error_code` in MVP — the prefix keeps the schema
flat and remains both human-readable and regex-parseable for future
filter-by-code work.

**Idempotency expectations.**
- Callbacks may be delivered more than once — duplicate success callbacks
  are safe no-ops (missing `external_post_id` is backfilled if newly provided)
- Duplicate failure callbacks only overwrite `last_error` +
  `publish_attempted_at` if the incoming error info differs from stored
  (empty re-callbacks preserve the existing error)
- A successful delivery is never regressed by a later failure callback —
  `posted + failed` is **refused** (200 with `refused=true` so Manus stops
  retrying)
- Dispatcher may be invoked more than once per delivery safely — the atomic
  `FOR UPDATE SKIP LOCKED` claim guarantees a queued row is picked up by
  exactly one dispatcher pass

**Out of scope (Phase 2 closed).** Retry with exponential backoff,
approved-payload snapshot (deferred — no refine-after-approval in MVP),
multi-platform posts.

### Manus platform payload mapping (2026-04-23)

Between the generic delivery row and the Manus HTTP handoff, the
dispatcher routes the approved content through a per-platform mapper at
[`src/lib/manus/platform-payload.ts`](../src/lib/manus/platform-payload.ts).
The mapper is pure, typed, dispatcher-independent, and never rewrites
approved content — it only rearranges existing fields into slots each
platform is most likely to want.

**`ManusDispatchPayload` shape** (after 2026-04-23):

```
{
  post_id, delivery_id, platform, brand, scheduled_for, source, retry_count,
  content:          { headline, caption, cta, banner_text, image_prompt },  // unchanged flat block
  publish_payload:  PublishPayload,                                          // NEW discriminated union
}
```

`content` is preserved as-is for backward safety — stub/dry-run code
and any existing Manus-side readers that only consume it continue to
work. `publish_payload` is the recommended forward-path consumption
target.

**Per-platform shapes** (all fields `| null` when source was empty):

| Platform | Primary text field | Supporting fields | Notes |
|---|---|---|---|
| `facebook` | `primary_text` (caption → headline fallback) | `headline`, `call_to_action`, `banner_text`, `image_prompt` | Caption-focused; headline retained for ads-like posts |
| `instagram` | `caption` (caption → headline fallback) | `call_to_action`, `banner_text`, `image_prompt` | Caption-focused; hashtags stay inline in caption (AI layer already baked them in) |
| `twitter` | `tweet_text` (caption → headline fallback) | `call_to_action`, `image_prompt` | No `banner_text` — X has no native overlay; burn into media at render time |
| `tiktok` | `caption` (caption → headline fallback) | `call_to_action`, `banner_text`, `image_prompt` | Media-first; caption shapes as supporting text; `image_prompt` is narrative anchor, not final video |
| `telegram` | `text` (caption → headline fallback) | `headline`, `call_to_action`, `banner_text`, `image_prompt` | No `parse_mode` hint — plain text only; HTML/Markdown support deferred until AI content escape-safety is confirmed |

**Observability.** `buildPublishPayload()` emits one line per call:

```
[manus-payload] delivery=<id> platform=<p> mapper=<p> present=<a,b,...> omitted=<c,d,...>
```

No content values in the log — operators inspect actual content via
the Delivery Status modal. `present`/`omitted` surfaces why a field
was left empty (the source Post field was null or empty after trim).

**What this layer intentionally does NOT do.**

- No character-count enforcement (e.g. Twitter 280). Text is passed
  through verbatim — content validation is a separate concern and not
  yet defined.
- No hashtag normalization or count enforcement. Hashtags are already
  inline in the AI-generated caption; we preserve them there.
- No media URL verification or hosting. `image_prompt` is a narrative
  pass-through reference; final media pipeline (asset hosting,
  public-URL validation, per-platform format rules) is the next Manus
  hardening task.
- No mutation of approved content. The mapper picks first-non-empty
  between `caption` and `headline` for the platform's primary text
  slot but never modifies the string (no trimming, no hashtag moving,
  no casing changes).

**Extension pattern.** Adding a new platform means:

1. Add the value to the Prisma `Platform` enum (migration).
2. Declare a `XxxPublishPayload` interface in `platform-payload.ts`
   with `platform: "xxx"` discriminator.
3. Add to the `PublishPayload` union.
4. Write `mapXxx(source)` + add a case to `buildPublishPayload()`'s
   switch. The `_exhaustive: never` default forces TypeScript to
   fail if step 4 is skipped.

No dispatcher change, no callback change, no retry change — the
generic envelope absorbs the new platform transparently.

### AI content generator

Lives under `src/lib/ai/`. Turns structured source facts + brand context
into draft samples that get inserted into Content Queue. AI creates
drafts only — Content Queue handles human review; Manus handles publishing.
Never invoked at publish/retry time.

**Pipeline** (one function call per generation run):

```
raw source facts
   ↓ (per-source normalizer)
NormalizedGenerationInput
   ↓ (buildPrompt)
StructuredPrompt
   ↓ (generateSamples — client.ts)
GeneratedSample[]
   ↓ (insertSamplesAsDrafts)
Post[] (draft, grouped by sample_group_id)
```

**Module map** (everything under `src/lib/ai/`):
- `types.ts` — canonical shapes: `NormalizedGenerationInput`,
  `BrandContext`, `EventOverride`, `EffectiveContext`, `SourceFacts` (union),
  `GeneratedSample`.
- `resolve-context.ts` — `resolveEffectiveContext(brand, event?)` merges
  Brand base + Event override into a single `EffectiveContext` consumed
  by the prompt builder. Records `overridden_by_event[]` for transparency.
- `source-normalizers/*` — one per source type. Each produces
  `NormalizedGenerationInput` from raw per-source facts.
- `fixtures/*` — mock per-source facts for dev. Live source adapters
  (BigQuery for big_win + hot_games, per-brand API for promo) land in
  Phase 3 work and will produce the exact same `*Facts` shapes. The
  `promo` live adapter ships as `src/lib/promotions/` (see below);
  big_win + hot_games remain fixture-only until
  `shared.game_rounds` is provisioned.
- `prompt-builder.ts` — builds a structured `StructuredPrompt` with
  labeled sections (positioning, voice, audience, language style,
  notes, restrictions, hashtags, sample captions, platform hint,
  source facts, optional event override). Emits a strict JSON
  `output_schema` every provider must honor. Versioned via
  `PROMPT_VERSION`.
- `client.ts` — swappable provider. `AI_PROVIDER=stub` (default) returns
  deterministic placeholder samples so the whole pipeline runs without
  a provider account. `AI_PROVIDER=anthropic` routes through
  `@anthropic-ai/sdk` with `ANTHROPIC_API_KEY` (required) and
  `ANTHROPIC_MODEL` (optional, default `claude-sonnet-4-6`). Fails loud
  if the key is missing — no silent stub fallback. Response parsing
  uses an assistant pre-fill with `{` + a balanced-brace JSON extractor
  + a Zod schema (see `serialize-prompt.ts` + `parse-response.ts`).
- `serialize-prompt.ts` — turns the provider-agnostic `StructuredPrompt`
  into Anthropic's `{ system, user }` pair. Output schema is restated
  inline in the user message with exact JSON shape + required sample
  count.
- `parse-response.ts` — extracts the first top-level JSON object from
  model output (handles markdown fences + prose-wrapping), validates
  via Zod against the canonical `GeneratedSample` shape, and truncates
  extras / errors on shortage.
- `queue-inserter.ts` — writes each sample as a `draft` Post with
  `sample_group_id`/`sample_index`/`sample_total` in
  `generation_context_json` (matches the existing Queue enrichment
  convention). Preserves per-source snapshot fields (e.g. Hot Games
  frozen ranked list, event occurrence, big-win source row) so refine
  cycles stay source-constrained.
- `generate.ts` — orchestrator `runGeneration()`. Single entry point.
- `load-brand.ts` — `loadBrandContext(brandId)` / `brandOr404(brandId)`
  server helpers to turn a Brand row into the `BrandContext` shape.
- `load-templates.ts` — `loadBrandTemplates(brandId, caps?)` server
  helper that fetches the reusable Templates & Assets library as
  **optional reference sections** for the prompt. Deterministic +
  capped: brand-scoped active entries first (updated_at DESC), then
  top-up from globals. Per-type caps
  (`copy=3, cta=5, banner=5, prompt=3, asset=5`) bound prompt size.
  Never overrides Brand or Event layers — enforced at the prompt
  builder via explicit "optional — imitate structure, don't copy
  verbatim" section framing + a matching HARD RULE line in the system
  instruction. Counts are recorded per run in
  `generation_context_json.templates_injected`; template content is
  not snapshotted.

**Brand base + Event override precedence** (see
`docs/07-ai-boundaries.md` and `resolveEffectiveContext()`):
- Brand Management is the default layer on every generation call.
- When the post is event-derived, the Event brief overrides brand
  fields it specifies (`tone`, `cta` → cta_style, `target_audience` →
  audience_persona). Brand positioning is never overridden.
- `notes_for_ai` is *appended* rather than replaced — the brand voice
  still matters even when the event has extra guidance.

**Source types supported** (Phase 4 MVP):
- `big_win` — 3 samples default (BigQuery-shaped facts; fixture only)
- `promo` — 3 samples default (per-brand API — **live adapter** in
  `src/lib/promotions/`, with `src/lib/ai/fixtures/promo.ts` as a
  drop-in replaceable fallback)
- `hot_games` — 2 samples default (BigQuery-shaped scan; fixture only)
- `event` — 1 sample per (occurrence × platform) default (real Event
  rows, live)
- `educational` — 2 samples default (structured packet; fixture only)

**Image generation.** Deferred. Every generated sample carries an
`image_prompt` string; the image-rendering provider + model are picked
in a later task. No schema changes needed when it lands.

**Dev entry point.** `POST /api/ai/generate-from-fixture` is an
admin-only dev route gated by `ALLOW_AI_FIXTURES=true`. It feeds a
bundled fixture through the full pipeline — useful for exercising the
Content Queue against AI-produced drafts without live source data.

**Event entry point.** `POST /api/events/[id]/generate-drafts` (existing)
now calls `runGeneration()` for each (occurrence × platform) slot that
doesn't already have a draft. Legacy dedupe on
`(source_instance_key, platform)` is preserved. Add
`?samples_per_slot=N` (1–5) for multiple sibling samples per slot.

**Refine compatibility.** Because refine is locked to review-side
statuses (see docs/06-workflows-roles.md) and source-constrained to
visual/tone/presentation, the generator's `generation_context_json`
snapshot is the same shape the existing refine modal already expects —
especially the Hot Games `type: "hot_games_snapshot"` + `ranked_games`
fields, which the queue-inserter writes for every hot_games draft.

### Running Promotions live adapter — `src/lib/promotions/`

Pulls live promo data from each brand's own API. Per-brand (not
BigQuery), so it ships independently of the `shared.game_rounds` work
that gates big_win + hot_games. Consumes
`Brand.integration_settings_json` fields (`api_base_url`,
`promo_list_endpoint`, `external_brand_code`). Produces
`PromoFacts[]` — the exact shape that
`src/lib/ai/source-normalizers/promo.ts#normalizePromo()` consumes.

Module map (everything under `src/lib/promotions/`):
- `types.ts` — `PromoAdapterResult`, `PromoAdapterErrorCode`
  (`BRAND_NOT_CONFIGURED` / `NETWORK_ERROR` / `HTTP_ERROR` /
  `PARSE_ERROR` / `SCHEMA_ERROR`), `PromoIntegrationConfig`.
- `load-integration.ts` — thin Prisma helper. Reads the three
  integration fields from `Brand.integration_settings_json`; returns
  `null` (treated as `BRAND_NOT_CONFIGURED`) when either required
  field is absent or blank.
- `client.ts` — `fetchPromotionsRaw(config)`. Native `fetch()`,
  stateless, does not interpret HTTP status / does not parse JSON /
  does not throw on non-2xx. Sends `X-Brand-Code` when
  `external_brand_code` is configured. Constructs the URL via
  `new URL(promo_list_endpoint, api_base_url)` so both absolute and
  relative endpoint values work. Same small-boundary shape as
  `src/lib/manus/client.ts`.
- `normalize.ts` — tolerant per-row parser. Accepts **both** upstream
  shapes: `{ data: Promotion[] }` envelope and bare `Promotion[]`.
  Required-for-inclusion fields: `id` (or `promo_id` / `promoId`) +
  `title` (or `name`). Optional fields mapped best-effort:
  `mechanics` / `description` / `summary` → `mechanics`;
  `reward` / `prize` → `reward`;
  `period_start` / `startsAt` / `start_date` → `period_start`
  (ISO-coerced); same pattern for `period_end`; `min_deposit` /
  `minimum_deposit` → `min_deposit`; `terms` / `terms_summary` /
  `tnc` → `terms_summary`. Malformed rows land in `skipped[]`
  with a reason — batch survives.
- `adapter.ts` — `fetchPromotionsForBrand(brandId)` orchestrator.
  Never throws on expected conditions; all surface through
  `result.error`. `error` + `promos` are **not** mutually exclusive
  (SCHEMA_ERROR may still return a subset of valid promos for
  partial-ingest recovery). Emits one log line per call:
  `[promotions] brand=<id> endpoint=<url> status=<http> count=<N> skipped=<M> err=<code?>`.

Verification surfaces:
- Admin dev route `POST /api/promotions/fetch-preview` — gated by
  `ALLOW_ADMIN_PROMO_PREVIEW=true` env + admin role. Returns the raw
  `PromoAdapterResult`. Same gating pattern as
  `/api/ai/generate-from-fixture`.
- CLI script `npm run promotions:preview -- <brand_id>` — runs the
  adapter directly, prints a summary + full JSON dump. Exit code 1
  on any `error` field, 0 otherwise.

AI pipeline hookup (same shape the existing fixture produces, so it's
drop-in):

```ts
const res = await fetchPromotionsForBrand(brandId);
for (const facts of res.promos) {
  for (const platform of targetPlatforms) {
    const input = normalizers.normalizePromo({ brand, facts, platform });
    await runGeneration({ input, created_by: "system" });
  }
}
```

The actual scheduler that calls `fetchPromotionsForBrand()` on a
cadence is **Phase 5** — the adapter is complete source-side but is
not yet wired to an automation.

### Big Wins live adapter — `src/lib/big-wins/`

BigQuery-sourced (global dataset, not per-brand API). Reads from
`shared.game_rounds` joined against `shared.users` (for username,
brand-scoped) and `shared.games` (for name + vendor).

Shipped on top of the provisional `GameRoundRow` interface while the
platform team finishes provisioning `shared.game_rounds` — the adapter
detects the missing table and degrades to `status: "missing"` without
crashing, exactly like the BQ smoke test.

Module map:
- `types.ts` — `BigWinAdapterInput`, `BigWinAdapterResult`,
  `BigWinAdapterStatus` (`ok` / `missing` / `error`),
  `BigWinAdapterErrorCode` (`INVALID_INPUT` / `BQ_ERROR`),
  `BigWinRow` (adapter-internal row shape with joined user + game
  fields — used by automation-rule evaluation).
- `query.ts` — `buildBigWinsQuery()`. Parameterized SQL via
  `SHARED_TABLES.*`, WHERE brand + `status='settled'` +
  `settled_at >= since` + thresholds combined by `logic` ("AND" or
  "OR"). OR vs AND branches at build time so parameters stay clean.
  `ORDER BY settled_at DESC LIMIT N`.
- `normalize.ts` — `lift()` (raw row → `BigWinRow` with unwrapped
  timestamps), `toBigWinFacts()` (`BigWinRow` → `BigWinFacts` applying
  `maskUsername()`; falls back to `"[anon]"` on null username),
  `buildSourceRowKey()` (derived dedupe key
  `bq-big-win-<user>-<timestamp>-<payout>`; final `win_id`-based key
  is a follow-up pending platform confirmation).
- `adapter.ts` — `fetchBigWinsForBrand(input)` orchestrator.
  Missing-table detection: `/Not found: Table/i.test(errorMessage)` →
  `status: "missing"` without populating `error`. Never throws on
  expected conditions.

Two output layers on purpose:
- `result.rows[]` — raw adapter rows for automation-rule eval (custom
  ranges etc. applied in-memory caller-side).
- `result.facts[]` — 1:1 with rows, pre-masked, matching the exact
  `BigWinFacts` shape from `src/lib/ai/types.ts`. Ready to hand to
  `normalizeBigWin()`.

Observability line: `[big-wins] brand=<id> status=<ok|missing|error> rows=<N> facts=<N> err=<code?>`.

### Hot Games live adapter — `src/lib/hot-games/`

BigQuery aggregation over `shared.game_rounds` filtered by rolling
window (`bet_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL N MINUTE)`)
joined to `shared.games` for display metadata (name, vendor, icon,
static RTP). Ranking: `g.rtp DESC`, tie-break on `round_count DESC`.
Intentionally simple — observed-payout ranking is a clean follow-up
once real data reveals whether it beats the static-RTP ordering.

Unlike Big Wins (many `facts[]`), Hot Games produces ONE frozen
snapshot per call — `result.facts` is a single `HotGamesFacts` (or
`null` on missing/error). The **frozen-snapshot contract** from
docs/07-ai-boundaries.md is honored here: the adapter result IS the
snapshot; refine cycles must reuse the facts baked into
`Post.generation_context_json` at draft creation time (not re-scan).

Module map:
- `types.ts` — `HotGamesAdapterInput` (brand, `source_window_minutes`
  30/60/90/120, `hot_games_count` 3..10, `time_mapping: string[]`),
  `HotGamesAdapterResult`, `HotGameRow`.
- `query.ts` — `buildHotGamesQuery()`. Parameterized aggregation
  grouping on `game_code` + joined game columns, `HAVING g.rtp IS NOT NULL`
  (games without RTP can't be ranked by the static-RTP ordering).
- `normalize.ts` — `liftHotGame()`, `validateHotGamesInput()`
  (window enum + count range + time_mapping length + `"HH:MM"` regex +
  strictly-ascending per operator rule), `toHotGamesFacts()` (builds
  `ranked_games[]` with per-rank `time_slot_iso` composed from
  operator mapping; auto-derives `time_slot_summary` like
  `"6pm–11pm tonight"` when unset).
- `adapter.ts` — `fetchHotGamesForBrand(input)` orchestrator. Same
  missing-table detection as Big Wins. Validation runs before any BQ
  call — bad input returns `status: "error"` + `INVALID_INPUT`
  immediately.

Observability line: `[hot-games] brand=<id> status=<ok|missing|error> rows=<N> window=<N>m err=<code?>`.

### Verification surfaces (both BQ adapters)

- Admin dev routes gated by `ALLOW_ADMIN_BQ_PREVIEW=true` (shared env
  flag — single switch controls both):
  - `POST /api/big-wins/fetch-preview`
  - `POST /api/hot-games/fetch-preview`
- CLI scripts (runnable via `tsx`, bypass the route gate — operator's
  shell already authenticates):
  - `npm run big-wins:preview -- <brand_id> [--min-payout N] [--min-multiplier N] [--logic AND|OR] [--since ISO] [--limit N] [--currency CCY] [--self-check]`
  - `npm run hot-games:preview -- <brand_id> [--window 30|60|90|120] [--count 3..10] [--mapping HH:MM,HH:MM,...] [--summary TEXT] [--self-check]`
- Both CLIs auto-run a **normalizer self-check** when live BQ returns
  `status: "missing"` — hand-rolls a row through the lift → normalize
  pipeline and asserts the produced facts match the shape from
  `src/lib/ai/fixtures/big-win.ts` / `hot-games.ts`. This means
  shape regressions are caught today, before `shared.game_rounds`
  lands.

### External Data Source — Shared BigQuery
Primary operational facts come from a shared BigQuery dataset maintained by the platform team.
Tables: `shared.users`, `shared.transactions`, `shared.game_rounds`, `shared.games`.
Sync: hourly at :00 GMT+8. PII removed. Read-only for us.
Query execution billed to our own GCP project (`mktagent-493404`) — never the platform project.
Schema is still evolving; see docs/04-automations.md for field mapping and volatility strategy.

### Jobs
Scheduled jobs for rollups and lightweight background tasks.

---

## Design Principles

- Build simple and clear first
- Keep modules easy to understand
- Avoid hidden magic
- Prefer explicit workflows
- Human approval before publish in MVP
- Brand isolation with shared infrastructure
