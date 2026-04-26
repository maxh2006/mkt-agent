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

### Manus media handoff + pre-dispatch URL validation (2026-04-23)

Before every dispatch that carries media URLs, the dispatcher runs
[`validateMediaUrls()`](../src/lib/manus/media-validation.ts) to
guarantee Manus only receives **publicly fetchable HTTP(S) URLs**.
Broken / private / unreachable URLs fail pre-dispatch with
`[MEDIA_ERROR] <reason>` in `last_error` — the existing retryability
classifier already maps that to fatal, so no new UI or retry-route
work is needed.

**Validation steps** (short-circuit in this order):

1. **Syntactic** — `new URL(raw)` must parse.
2. **Scheme** — `http:` or `https:` only.
3. **Host privacy** — reject `localhost`, `.local` / `.localhost`
   suffixes, IPv4 loopback (127/8), RFC1918 (10/8, 172.16/12,
   192.168/16), link-local (169.254/16), 0/8, IPv6 `::1`, link-local
   `fe80::/10`, ULA `fc00::/7`.
4. **Reachability** — `HEAD` with 5s timeout, 3-hop manual redirect cap
   (re-checks host privacy on every hop to block open-redirect → internal
   target). On HEAD 405/501 or network error, falls back to `GET` with
   `Range: bytes=0-0`.

Each failure produces a typed
`MediaValidationIssue = { url, reason, message, http_status? }` where
`reason ∈ "invalid_url" | "unsupported_scheme" | "private_host" | "unreachable" | "http_error"`.

**Dispatcher integration.** Between payload build and
`dispatchToManus()`:

```ts
const mediaUrls = collectMediaUrls(post);
if (mediaUrls.length > 0) {
  const validation = await validateMediaUrls(mediaUrls);
  logMediaCheck({ delivery_id, platform, result: validation,
                  action: validation.ok ? "dispatched" : "blocked" });
  if (!validation.ok) {
    // mark delivery failed, run reconcilePostStatus(), skip dispatch
  }
}
```

**URL source.** Activated 2026-04-23 — `collectMediaUrls(post)` returns
`[post.image_url]` when `Post.image_url` is a non-empty trimmed string,
`[]` otherwise (`Post.image_prompt` is narrative AI input, NEVER a URL
— never returned here). Text-only posts and posts with null/empty
`image_url` short-circuit with zero validation. Operators populate
`image_url` via the queue detail page's edit UI (gated to Draft /
Rejected per the no-refine-after-approval rule); future AI image
generation will populate the same field programmatically. MVP shape is
a single URL per post — the return type is already `string[]` so
carousels / per-platform variants can evolve without a dispatcher code
change.

**Retryability.** `[MEDIA_ERROR] <reason>` is parsed by
`parseManusErrorCode()` → maps to fatal in
[retryability.ts](../src/lib/manus/retryability.ts) → Delivery Status
modal shows "Fatal — fix first" chip + "Fix required" action text;
backend retry route returns 422. Unified with Manus-side MEDIA_ERROR
handling — operators see the same UX whether the bad URL was caught
here or reported back by Manus.

**Observability.** One line per pre-dispatch check, zero lines when
`mediaUrls` is empty:

```
[manus-media] delivery=<id> platform=<p> urls=<N> result=<ok|failed> issues=<reason1,reason2> action=<dispatched|blocked>
```

No URL values logged.

**Out of scope.** No per-platform media rules (aspect ratio, mime type,
size caps, video duration, carousel constraints) — deferred. No
approval-time validation (MVP validates at dispatch only; URLs can go
bad between approval and dispatch, so dispatch-time is the
last-responsible-moment anyway). No object storage / asset hosting —
separate task.

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

**Image generation — visual input architecture (2026-04-23 backend + spec; UI + model still pending).**

The image pipeline intentionally splits into two halves:

1. **AI generates backgrounds / art only** — never typography, never
   text, never drawn logos.
2. **The app renders final text + logos as a deterministic overlay**
   using the chosen layout template's safe zones. This is the only
   way to guarantee crisp typography, exact wording, and zero
   spelling hallucination on branded copy.

**Module layout** (all under [`src/lib/ai/visual/`](../src/lib/ai/visual/)):

- `types.ts` — `BrandVisualDefaults`, `EventVisualOverride`,
  `LayoutTemplate`, `SafeZone`, `TextZone`, `CompiledVisualPrompt`,
  plus the canonical enums: `VISUAL_STYLES`, `VISUAL_EMPHASES`,
  `MAIN_SUBJECT_TYPES`, `LAYOUT_FAMILIES`, `PLATFORM_FORMATS`.
  Operators pick from these enums via Simple Mode controls — they
  never author freeform visual prompts.
- `layouts.ts` — `LAYOUT_TEMPLATES`: `center_focus` / `left_split` /
  `right_split` / `bottom_heavy`. Each has resolution-independent
  text zones + safe zones + logo slot + optional gradient overlay +
  CTA alignment + emphasis area. `resolveLayout(preferred, format)`
  handles format-incompatibility fallback.
- `compile.ts` — `compileVisualPrompt()`. Pure function:
  `brand + event? + platform + source_facts? → CompiledVisualPrompt`.
  Merges Brand ← Event (per-field override tracking), resolves
  platform format with precedence Event > platform-appropriate >
  Brand default, derives subject focus from source facts when
  available, composes the background prompt + safe-zone instruction,
  composes the negative prompt starting from a hardcoded baseline
  (no text / letters / typography / logos / watermarks / signage)
  with Brand + Event negatives appended. Locks `render_intent` to
  `"ai_background_then_overlay"`.
- `validation.ts` — `brandVisualDefaultsSchema` +
  `eventVisualOverrideSchema` Zod schemas, plus
  `DEFAULT_BRAND_VISUAL_DEFAULTS`. Standalone (not yet wired into
  the existing brand/event Zod validators) so the shape can land
  without touching active API routes.

**Precedence** (mirrors the text pipeline):
`Brand Management (base) → Source facts (context) → Event brief (override) → Templates (supporting library)`.
Visual compiler only reads Brand + Event + source; Templates do not
elevate to a policy layer.

**Product rule.** Brand-level visual defaults are now authored on the
Brand Management → Design tab Simple Mode form (UI shipped 2026-04-27)
and persist into `Brand.design_settings_json.visual_defaults` — no
migration, the JSON column already existed. Validated server-side via
`brandVisualDefaultsSchema` (re-exported through
`src/lib/validations/brand.ts#designSettingsSchema`). Event-level
visual overrides ship later the same day (UI shipped 2026-04-27,
migration `20260427150000_event_visual_settings_json` adds the new
nullable `Event.visual_settings_json` JSONB column). Validated via
`eventVisualOverrideSchema` (re-exported through
`createEventSchema` / `updateEventSchema`). Event override is a
**partial** override — only fields explicitly set are present;
unspecified fields fall through to Brand defaults at compile time.

**Background-image provider boundary (2026-04-27 — stub default,
Gemini / Nano Banana 2 first real adapter shipped).** `src/lib/ai/image/`
ships a provider boundary symmetrical to the text-generation boundary
at `src/lib/ai/client.ts`. The orchestrator runs
`generateBackgroundImage()` AFTER text generation — one image request
per run, shared across every sibling draft (the compiled visual
prompt is identical for siblings). Selectable providers:
- `stub` (default; returns `status: "ok"` with `artifact_url: null`,
  zero cost, prod-safe fallback)
- `gemini` (real adapter, `src/lib/ai/image/gemini.ts`) — calls
  Nano Banana 2 (`gemini-3.1-flash-image-preview` by default; override
  via `AI_IMAGE_MODEL`). Auth: `GEMINI_API_KEY` from Google AI Studio,
  fail-loud on absence. Returns inline base64 bytes encoded as a
  `data:image/png;base64,…` URI in `artifact_url`. See
  `docs/08-deployment.md` "Image generation provider — Gemini /
  Nano Banana 2" for the full prod auth / flip / billing-verification
  procedure.
- `imagen` / `stability` (recognised but unimplemented; throw
  fail-loud until shipped — no silent fallback on misconfig).

Failure is isolated: any throw from the image provider is caught,
normalized into a `status: "error"` result via
`buildImageErrorResult()`, and the run still inserts text drafts. The
Gemini adapter additionally returns `status: "error"` results for
4xx / 5xx / timeout / content-policy responses without throwing —
each mapped onto the canonical `ImageProviderErrorCode` taxonomy
(see docs/07-ai-boundaries.md). The result is persisted per draft as
`Post.generation_context_json.image_generation` — see "AI content
generator → image_generation block" below for the persisted shape.
**`Post.image_url` is intentionally untouched** — that field remains
reserved for the FINAL composited image produced by the deferred
overlay renderer.

**MVP storage decision (locked 2026-04-27).** Gemini returns inline
image bytes (no hosted URL). For the smallest clean persistence path
we encode them as `data:image/png;base64,…` URIs and store directly
in `image_generation.artifact_url`. DB cost: ~100KB-1MB per draft per
generation run; acceptable while volume is low. Migrating to a
GCS-backed `https://…` URL is a follow-up (the field is stable; only
the URL scheme changes). The overlay renderer (below) reads the data
URI directly via `Buffer.from(base64, "base64")` without hitting any
external storage.

**Deterministic overlay renderer (2026-04-27).** New module
`src/lib/ai/render/` composites Post text + brand logo onto the AI
background using the layout's text zones / safe zones / logo slot
from `visual_compiled.safe_zone_config` + the layout spec at
`src/lib/ai/visual/layouts.ts`. Toolchain: `satori` (JSX → SVG) +
`@resvg/resvg-js` (SVG → PNG). No headless browser, no Cairo dep,
no canvaskit. Bundled fonts: Open Sans Regular + Bold (OFL-licensed,
TTFs committed under `public/fonts/`). The orchestrator runs
`renderFinalImage()` AFTER background-image generation with try/catch
isolation — text drafts always ship even if the renderer errors.

Inputs:
- `image_generation.artifact_url` (data URI when present; null →
  brand-color solid fallback)
- `visual_compiled` (layout, safe zones, gradient overlay, format)
- First sample's `headline / caption / cta / banner_text`
- `Brand.design_settings_json.logos[layout.logo_slot.variant]` (with
  SSRF-safe fetch via `isPrivateHost` from media-validation; failures
  silently skip the logo)

Output: `Post.generation_context_json.composited_image` per draft
(replicated from one render per run across all sibling drafts).
Fields: `status`, `artifact_url` (data URI), `width`, `height`,
`layout_key`, `platform_format`, `visual_emphasis`,
`background_fallback`, `logo_drawn`, `error_code`, `error_message`,
`generated_at`, `duration_ms`, `render_version` (`v1-2026-04-27`).
Error taxonomy: `MISSING_INPUTS` / `BACKGROUND_DECODE_FAILED` /
`FONT_LOAD_FAILED` / `SATORI_FAILED` / `RESVG_FAILED` / `UNKNOWN`.

**`Post.image_url` is STILL not touched.** Manus media-validation
requires http(s) URLs; data URIs would block dispatch. The GCS
storage migration follow-up promotes both `image_generation.artifact_url`
and `composited_image.artifact_url` to hosted URLs and at THAT point
auto-populates `Post.image_url` from the composite. Until then,
operators continue to paste a hosted image URL manually for posts
they want to publish.

Smoke: `npm run render:smoke` builds a synthetic request and writes
a sample PNG to `/tmp/render-smoke.png` (~140KB at 1080x1080, ~1.1s
on the dev box). Confirms the Satori + Resvg pipeline is working
without depending on the AI providers.

**Compiler activated in the live AI generation pipeline (2026-04-27).**
`runGeneration()` in `src/lib/ai/generate.ts` now calls
`compileVisualPrompt()` after templates load, threading
`Brand.design_settings_json.visual_defaults` (via `loadBrandContext()`)
and `Event.visual_settings_json` (via the events generate-drafts
route) into the compiler. The compiled `CompiledVisualPrompt` is
attached to `NormalizedGenerationInput.visual` and consumed by:

- The prompt builder, which surfaces a new "Visual Direction" section
  (subject focus, visual emphasis, layout family, platform format,
  override audit, top negatives) so the AI's narrative `image_prompt`
  field aligns with the structured cues. `PROMPT_VERSION` bumped
  `v2-2026-04-22` → `v3-2026-04-27`.
- The queue inserter, which writes a `visual_compiled` block per
  draft into `generation_context_json` carrying `layout_key`,
  `safe_zone_config` (for the renderer), `render_intent`,
  `platform_format`, `visual_emphasis`, `subject_focus`,
  `effective_inputs.overridden_by_event` (for audit), the compiled
  `background_image_prompt` (for the future image model), and the
  compiled `negative_prompt`.
- The background-image provider (2026-04-27 — stub-only initial
  landing). Per-draft `generation_context_json.image_generation` block
  carries: `provider`, `model`, `status` (`ok`/`skipped`/`error`),
  `artifact_url`, `provider_asset_id`, `width`, `height`,
  `background_image_prompt`, `negative_prompt`, `skipped_reason`,
  `error_code`, `error_message`, `generated_at`, `duration_ms`,
  `render_version`. Error taxonomy: `NOT_CONFIGURED` / `AUTH_ERROR` /
  `RATE_LIMITED` / `INVALID_PROMPT` / `POLICY_REJECTED` /
  `TEMPORARY_UPSTREAM` / `NETWORK_ERROR` / `UNKNOWN`.

The narrative `image_prompt` field on `Post` is still AI-emitted —
operators continue to see + edit a human-readable visual description.
The image-rendering provider boundary now exists (stub provider only
for MVP); the overlay renderer remains deferred. Their inputs are
ready (compiled positive + negative prompts + safe-zone config +
background-image provider result persisted on every generated draft).
`Post.image_url` + the media-validation layer (shipped 2026-04-23)
already support any image-rendering backend once a real image model
adapter ships AND the overlay renderer composites a final image.

**Live smoke.** `npm run visual:smoke` runs 27 assertions across 6
cases exercising Brand-only / Event-override / layout fallback /
baseline negatives / format precedence / source-facts fallback.
Exits 0 on all-clear.

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

---

## Long-term direction

The current architecture is sized for MVP scope (content generation + posting
automation, Philippines-first / WildSpinz). Two long-term compatibility
requirements are preserved here so today's choices don't foreclose them.
Principle-level framing lives in ROADMAP.md "Long-Term Architecture
Principles"; this section adds the architectural elaboration. **MVP scope and
current phase priorities are unchanged.**

### External intelligence signals

mkt-agent is the **execution layer**, not the intelligence layer. Future AI
systems — most concretely **OMEGA**, a separate competitive-intelligence
platform spec'd outside this repo — will emit structured signals: competitor
activity, sentiment / risk, opportunity flags, recommended campaign
directions, urgency / target audience / target channel hints. mkt-agent must
be able to ingest those signals and execute marketing actions from them,
without coupling its internals to any specific upstream's schema or stack.

Today's source intake — BigQuery for `big_win` + `hot_games`, per-brand REST
API for `promo`, real Event rows for adhoc campaigns, fixtures for
`educational` — is **not necessarily final**. The extension seam is:

- `SourceFacts` discriminated union in `src/lib/ai/types.ts`
- per-source normalizers under `src/lib/ai/source-normalizers/`
- `runGeneration()` orchestrator in `src/lib/ai/generate.ts`
- the `NormalizedGenerationInput` boundary that every normalizer produces

Future external signals land as additional `SourceFacts` variants funneled
through their own normalizer to `NormalizedGenerationInput`, then run through
the same generation / approval / publishing pipeline. They do not carve new
code paths around it.

Cross-system traffic mirrors the **Manus pattern** (see "Manus protocol —
finalized contract" above): HTTP/JSON, secret-gated endpoints, signed
callbacks if bidirectional. External intelligence systems remain their own
deploys with their own stacks — no shared DB, no shared deploy, no SDK
coupling. The boundary IS the contract.

The system should evolve toward a generalized **signal-to-execution model**
over time. MVP focus stays on content generation and posting automation; the
generalization is preserved as direction, not as a near-term build.

### Market profile layer (forward direction)

Today's context layering (see `docs/07-ai-boundaries.md` "Input Contract" +
`resolveEffectiveContext()` in `src/lib/ai/resolve-context.ts`):

```
Brand Management → Source facts → Event override → Templates (reference)
```

Forward direction for multi-market expansion:

```
Market profile → Brand Management → Source facts → Event override → Templates
```

A Market profile would carry language / tone norms, compliance rules
(PAGCOR-equivalents), platform behavior, payment-rail conventions, and
audience norms — anything that spans all brands operating in that market.
The merge would extend `resolveEffectiveContext()` to take a Market layer as
its base, with Brand Management overriding Market on conflict (same per-field
override pattern as Brand→Event today).

This is **not implemented**, and is not a near-term phase. It is named here
so today's Brand Management does not quietly absorb market-level concerns
and become painful to untangle later.

Practical guardrails today:
- Tagalog, GCash, PAGCOR are WildSpinz-PH specifics; they belong on Brand
  fields (correct), not promoted to global defaults.
- Code paths that will eventually run for a non-PH brand should not assume
  PH-specific conventions (e.g. payment-rail names, regulator-specific
  taxonomy, market-specific date formats).

MVP execution remains Philippines-first. The principle is forward
compatibility, not present-day work.
