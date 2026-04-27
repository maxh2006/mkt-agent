# 07-ai-boundaries.md

## AI Role

AI is used only for content generation from structured inputs.

AI can:
- generate captions
- generate banner text
- generate variations
- rewrite tone
- generate adhoc event concepts

AI cannot:
- compute metrics
- inspect raw analytics logs to derive facts
- calculate thresholds
- qualify big wins
- calculate promo payouts
- calculate attribution
- compute dashboard metrics

---

## Input Contract

AI should receive small structured packets.
Do not send full raw logs.

Context layers (base → override):
1. **Brand Management** — the base AI profile for each brand, authored by
   admin on the Brand Management page. Fields: `positioning`, `tone`,
   `cta_style`, `emoji_level`, `language_style` + `language_style_sample`,
   `audience_persona`, `notes_for_ai`, `banned_phrases[]`, `banned_topics[]`,
   `default_hashtags[]`, `logos`, colors, design notes, sample captions.
   All generation calls start from this layer.
2. **Adhoc Event brief** — overrides the brand layer on conflict when the
   post is event-derived. Fields: `theme`, `objective`, `rules`, `reward`,
   `target_audience`, `cta`, `tone`, `platform_scope`, `notes_for_ai`,
   `posting_instance_json`.

**Long-term direction (forward only — not implemented).** Future evolution
may extend layering in two ways: (a) a **Market profile** layer above Brand
for multi-market expansion (language / tone norms, compliance rules,
platform behavior, payment-rail conventions); (b) **source facts** may grow
to include external intelligence signals (e.g. OMEGA-style competitor /
sentiment / opportunity / compliance signals) alongside today's `big_win` /
`promo` / `hot_games` / `event` / `educational` types. The
`NormalizedGenerationInput` seam is the intended extension point. See
`docs/00-architecture.md` "Long-term direction" for the full framing. MVP
scope is unchanged.

Example packet shape:
- brand context (from Brand Management, base layer)
- post type
- platform
- source facts already computed by backend
- tone preferences (brand default, possibly overridden by event)
- CTA style (brand default, possibly overridden by event)
- (for event-derived posts) event brief layer

Canonical in-code shape: `NormalizedGenerationInput` at
`src/lib/ai/types.ts`. Every source-type normalizer produces this shape;
the prompt builder (`src/lib/ai/prompt-builder.ts`) reads from it. The
Brand→Event merge lives in `src/lib/ai/resolve-context.ts#resolveEffectiveContext()`
and records `overridden_by_event[]` so the prompt can surface the
override reasoning transparently.

### Templates & Assets — reusable supporting library

Alongside the two rule layers (Brand Management + Event), the AI
generator may draw from **Templates & Assets** — a reusable library of
concrete building blocks authored by operators / admins:

- `caption` → **Copy Templates** — reusable caption structures / post
  shapes. Pattern, not wording. AI pulls these as scaffolds when a
  source type calls for a proven post layout.
- `cta` → **CTA Snippets** — reusable call-to-action lines.
- `banner` → **Banner Text Patterns** — reusable short overlay-text
  patterns for banner/image creatives.
- `prompt` → **Prompt Templates** — reusable image-generation prompt
  scaffolds. Composed from brand identity + scene cues.
- `asset` → **Reference Assets** — reusable visual reference URLs.
  Distinct from Brand Management's `benchmark_assets` (which are
  base brand identity guidance, not operational library material).

Templates & Assets is **NOT a rule layer**. It never overrides brand or
event context; it only supplies building blocks when those rule layers
reach for one. The page UI restates this to prevent drift.

### Templates & Assets — prompt injection (2026-04-22)

Wired via `src/lib/ai/load-templates.ts`. The orchestrator
(`src/lib/ai/generate.ts#runGeneration`) calls it once per run and
attaches results to `NormalizedGenerationInput.templates` before the
prompt builder runs.

**Retrieval strategy** (deterministic, no ranking):
- Only `active = true` entries
- Brand-scoped first; globals (`brand_id IS NULL`) top up when
  brand-scoped < cap
- Ordered `updated_at DESC` within each bucket
- Per-type caps (bound prompt size):
  `copy=3, cta=5, banner=5, prompt=3, asset=5`
- 5 parallel Prisma queries; missing brand / missing templates return
  empty buckets (generation still runs)

**Prompt framing.** The prompt builder emits up to 5 conditional
sections, each skipped when its bucket is empty:
1. **Reference patterns** (copy) — "optional — imitate structure, don't
   copy verbatim"
2. **Reusable CTA examples** (cta) — "reference for CTA style; final
   CTA must still match the Brand's CTA style"
3. **Reusable banner examples** (banner) — "optional — short overlay-
   text patterns"
4. **Reference prompt scaffolds** (prompt) — "structural cues for the
   image_prompt field"
5. **Reference visual assets** (asset) — "mention descriptively in
   image_prompt where relevant; do not fabricate URLs"

**Precedence guarantee.** A new HARD RULE line in the system
instruction states: "REFERENCE sections are OPTIONAL patterns you MAY
imitate for structure and tone. They are NEVER rules. Brand, Source
Facts, and Event Brief always take precedence. Do not copy reference
entries verbatim." Templates cannot override banned phrases / topics,
the language style sample, audience persona, event rules, or positioning.

**Per-run metadata.** `generation_context_json.templates_injected`
stores per-bucket counts for every inserted draft:
```
{ copy: N, cta: N, banner: N, prompt: N, asset: N }
```
Counts only — template content is not snapshotted. The counts are
enough for future learning work to correlate reuse with approval /
refinement outcomes (Phase 6).

**Prompt version.** `PROMPT_VERSION = "v2-2026-04-22"`. Bumped from
`v1-2026-04-21` so historical drafts remain traceable to the older
prompt shape.

---

## AI generator — real provider (Anthropic Claude)

As of 2026-04-22 a real text-generation provider is wired behind the
client boundary at `src/lib/ai/client.ts`.

**Activation.** `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (required).
Optional `ANTHROPIC_MODEL` (defaults to `claude-sonnet-4-6`). With these
unset the pipeline runs on the deterministic stub — safe default for
dev / staging / review.

**Fields generated.** `headline`, `caption`, `cta`, `banner_text` (or
`null` when not applicable), and `image_prompt`. The `image_prompt` is
**narrative text only** — it describes what an image should look like,
it is NEVER a URL. Image rendering remains deferred; no image model is
locked. A separate nullable `Post.image_url` field (added 2026-04-23)
carries the public media URL when one exists — populated by operator
edit today, by AI image generation in the future. `image_url` is
validated pre-dispatch by
[`src/lib/manus/media-validation.ts`](../src/lib/manus/media-validation.ts)
(syntactic + scheme + host-privacy + reachability). The AI content
generator does NOT populate `image_url` — it only emits
`image_prompt`; a future image-rendering provider is the piece that
fills `image_url`.

**Visual input architecture (backend + spec landed 2026-04-23; UI + image
model + overlay renderer still pending).** The current narrative
`image_prompt` is **interim advisory output** — never sent directly to
an image model. It may inform `subject_focus` derivation inside the
hidden prompt compiler, nothing more.

**PRODUCT RULE (locked).** For any branded post:
- The AI image model generates the **BACKGROUND / ART ONLY**.
  Never text, letters, numbers, typography, brand names drawn in
  pixels, watermarks, logos, UI elements, or signage. The hidden
  prompt compiler enforces this both in the positive prompt ("leave
  quiet space for text overlay per safe zones") AND in a hardcoded
  baseline negative prompt that applies to every compiled output
  regardless of Brand / Event inputs. See
  [`src/lib/ai/visual/compile.ts`](../src/lib/ai/visual/compile.ts) —
  `BASELINE_NEGATIVES` cannot be shadowed or overridden.
- The app renders **FINAL TEXT + LOGOS AS A DETERMINISTIC OVERLAY**
  on top of the AI background, using the chosen layout template's
  safe zones + text zones + logo slot. This is the only way to
  guarantee crisp typography, exact wording, zero spelling
  hallucination, and brand-consistent logo rendering.

**Operator experience (Simple Mode first).** Operators do NOT author
visual prompts. They pick from structured enum controls defined in
[`src/lib/ai/visual/types.ts`](../src/lib/ai/visual/types.ts):

| Control | Values |
|---|---|
| `visual_style` | photographic / illustrated / 3d / vector / cinematic / minimalist |
| `visual_emphasis` | reward-forward / winner-forward / game-forward / brand-forward / lifestyle |
| `main_subject_type` | human / object / game-element / symbol / abstract |
| `layout_family` | center_focus / left_split / right_split / bottom_heavy |
| `platform_format` | square / portrait / landscape / story |
| `negative_visual_elements` | pickable/taggable list of forbidden elements |
| `visual_notes` | optional 200-char nudge (NOT a prompt, advisory only) |

**Brand-level persistence (UI shipped 2026-04-27).** Brand visual defaults
are authored on the Brand Management → Design tab Simple Mode form and
persist into `Brand.design_settings_json.visual_defaults` (no migration —
JSON column already existed). Validated server-side by
`brandVisualDefaultsSchema` from
[`src/lib/ai/visual/validation.ts`](../src/lib/ai/visual/validation.ts),
wired through `designSettingsSchema` in `src/lib/validations/brand.ts`,
enforced on PATCH `/api/brands/[id]`. The block is OPTIONAL on the wire
so brands created before the UI shipped continue to validate; the form
seeds `DEFAULT_BRAND_VISUAL_DEFAULTS` for new brands or legacy reads.
The legacy free-text design notes (`design_theme_notes`,
`preferred_visual_style`, etc.) are de-emphasized as a deprecated
collapsed section in the UI and are no longer the authoritative visual
rule source — the AI generator reads `visual_defaults`.

**Event-level override persistence (UI shipped 2026-04-27).** Event-level
visual overrides are authored on the Events → Create / detail pages
(Visual Override section, Simple Mode) and persist into a new
`Event.visual_settings_json` JSONB column (migration
`20260427150000_event_visual_settings_json`). Validated server-side by
`eventVisualOverrideSchema` from
[`src/lib/ai/visual/validation.ts`](../src/lib/ai/visual/validation.ts),
wired through `createEventSchema` / `updateEventSchema` in
`src/lib/validations/event.ts`, enforced on POST `/api/events` and PATCH
`/api/events/[id]`. The block is OPTIONAL on the wire and treated as a
**partial override** — only fields the operator explicitly sets are
present; everything unspecified falls through to the Brand defaults
field-by-field via `compileVisualPrompt()` in
`src/lib/ai/visual/compile.ts`. `visual_style` intentionally has no
Event override (stays brand-level for cross-event consistency). The
tolerant reader `coerceEventVisualOverride()` (in the same file as the
schema) drops out-of-enum legacy values silently on load so the form
never crashes on hand-edited JSON. Empty override blocks round-trip as
`null` to keep payloads clean — events without `visual_settings_json`
behave identically to events with `{}` (both = "no override").

**Compiler wired into live generation (2026-04-27).** `runGeneration()`
in `src/lib/ai/generate.ts` now calls `compileVisualPrompt()` for
every generation. `BrandContext` carries `visual_defaults` (lifted
from `design_settings_json.visual_defaults` via
`coerceBrandVisualDefaults()` server-side; falls back to
`DEFAULT_BRAND_VISUAL_DEFAULTS` for legacy brands). `EventOverride`
carries `visual_settings` (the partial override block, null when
absent). The compiled output is attached to
`NormalizedGenerationInput.visual` and consumed by:

- The prompt builder — new "Visual Direction" section between Platform
  and Source Facts. Surfaces resolved `subject_focus`,
  `visual_emphasis`, `layout_key`, `platform_format`, override audit,
  and top compiled negatives. The `image_prompt` field description in
  the output schema instructs the model to produce a narrative that
  aligns with these cues — the narrative is operator-readable preview;
  the compiled prompt that drives the image model lives separately in
  generation metadata. `PROMPT_VERSION` is now `v3-2026-04-27`.
- The queue inserter — writes a `visual_compiled` block per draft in
  `generation_context_json`: `layout_key`, `safe_zone_config`,
  `render_intent`, `platform_format`, `visual_emphasis`,
  `subject_focus`, `effective_inputs.overridden_by_event`,
  `background_image_prompt`, `negative_prompt`. This is the contract
  the future image-rendering provider + overlay renderer consume.

Backward safety: brands without a `visual_defaults` block load cleanly
(canonical defaults); events without `visual_settings_json` produce
zero-override compiles; non-event source types (`big_win`, `promo`,
`hot_games`, `educational`) pass `event: null` to the compiler. The
stub provider continues to work — `image_prompt` field still gets
emitted, just now aligned with the structured direction. Real
image-model + overlay rendering remain deferred.

**Background-image provider boundary (2026-04-27).** A provider
boundary symmetrical to the text-generation client lives at
`src/lib/ai/image/` (`types.ts` + `client.ts` + `gemini.ts`).
Selected via `AI_IMAGE_PROVIDER`:
- `stub` (default) — safe-prod fallback (returns a placeholder result
  with `artifact_url: null`, zero cost, zero external dependency).
- `gemini` — **first real adapter, shipped 2026-04-27**. Calls
  Nano Banana 2 (developer model id
  `gemini-3.1-flash-image-preview`; override via `AI_IMAGE_MODEL`)
  via the Google AI Studio Gemini API using `GEMINI_API_KEY`.
  Returns inline base64 image bytes encoded as a `data:` URI in
  `artifact_url`. Fail-loud on missing key — no silent fallback to
  stub. See `docs/08-deployment.md` "Image generation provider —
  Gemini / Nano Banana 2" for prod flip + billing-verification.
- `imagen` / `stability` — recognised provider values that throw
  fail-loud until implemented (no silent fallback on misconfig).

Inputs (one request per generation run, shared across siblings):
`background_image_prompt`, `negative_prompt`, `platform_format`,
`layout_key`, `safe_zone_config`, `subject_focus`, `visual_emphasis`,
`brand_palette` (primary/secondary/accent hex), and a `trace` block
for observability log lines (`brand_id`, `sample_group_id`,
`source_type`, `platform`).

Output (`BackgroundImageResult`): `status` ∈ {`ok`, `skipped`,
`error`}; `provider`; `model`; `artifact_url`; `provider_asset_id`;
`width`; `height`; echoed `background_image_prompt` +
`negative_prompt`; `skipped_reason`; `error_code` (canonical taxonomy:
`NOT_CONFIGURED` / `AUTH_ERROR` / `RATE_LIMITED` / `INVALID_PROMPT` /
`POLICY_REJECTED` / `TEMPORARY_UPSTREAM` / `NETWORK_ERROR` /
`UNKNOWN`); `error_message`; `generated_at`; `duration_ms`;
`render_version` (currently `v1-2026-04-27`).

Orchestrator integration: `runGeneration()` calls
`generateBackgroundImage()` AFTER `generateSamples()` (text). The call
is wrapped in try/catch — any throw is caught, normalized via
`buildImageErrorResult()` into a `status: "error"` result, and the
run still ships text drafts. Operators can inspect failure metadata
in the persisted `image_generation` block.

Persistence: per-draft `generation_context_json.image_generation` —
the queue inserter mirrors the result onto every sibling. **Crucially,
`Post.image_url` is NOT touched.** That field is reserved for the
FINAL publishable image produced by the deferred deterministic
overlay renderer (Satori/sharp/etc., not yet implemented). The
background artifact lives in metadata until that final composite step
exists. Manus media-validation runs against `Post.image_url` only —
background-only artifacts are never auto-shipped to Manus as the
final creative.

What's deferred:
- Additional real image-model adapters (Imagen / Stability / etc. —
  Gemini shipped today).
- Image inspector UI in Content Queue showing the composite preview
  + visual_compiled resolved direction.
- Lifecycle / cleanup of composite artifacts in GCS (rejected drafts'
  artifacts stay until a future cleanup job).

**Deterministic overlay renderer (2026-04-27 — shipped).** Module
`src/lib/ai/render/` composites Post text + brand logo onto the AI
background using the layout spec's text zones / safe zones / logo
slot. Satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG). Inputs:
`image_generation.artifact_url` (or brand-color fallback when null),
`visual_compiled`, first sample's `headline / caption / cta /
banner_text`, brand logos with SSRF-safe fetch. Output:
`Post.generation_context_json.composited_image` per draft —
`{status, artifact_url, width, height, layout_key, platform_format,
visual_emphasis, background_fallback, logo_drawn, bucket?,
object_path?, mime_type?, byte_length?, uploaded_at?, error_code,
error_message, generated_at, duration_ms, render_version}`. Error
taxonomy: `MISSING_INPUTS` / `BACKGROUND_DECODE_FAILED` /
`FONT_LOAD_FAILED` / `SATORI_FAILED` / `RESVG_FAILED` /
`STORAGE_NOT_CONFIGURED` / `STORAGE_AUTH_FAILED` /
`STORAGE_UPLOAD_FAILED` / `STORAGE_UNKNOWN` / `UNKNOWN`. One
composite per run, mirrored across siblings (text deltas between
siblings are minor; per-sibling re-renders aren't worth the cost in
MVP). The orchestrator wraps the call in try/catch — text drafts
always ship even if the renderer throws. `npm run render:smoke`
produces a sample composite from a synthetic request without
touching DB / network.

**GCS storage migration (2026-04-27 — shipped).** When
`GCS_ARTIFACT_BUCKET` is configured, the orchestrator uploads the
composited PNG to a public-read GCS bucket via
`src/lib/storage/gcs.ts#uploadCompositedPng()` (auth: ADC). The
resulting `https://storage.googleapis.com/<bucket>/<object_path>`
URL replaces the `data:` URI in `composited_image.artifact_url`,
and the queue inserter ALSO writes the same URL into
`Post.image_url` for every sibling draft — but ONLY when
`composited.status === "ok"` AND the URL starts with `https://`.
This is the single unlock that lets `Post.image_url` be auto-
populated for AI-generated creatives. Manus dispatch (existing,
unchanged) now naturally activates: `collectMediaUrls(post)` reads
`Post.image_url`, the existing `validateMediaUrls()` runs scheme +
host-privacy + reachability against the GCS URL, and the dispatch
proceeds. Failure isolation preserved: when storage is unconfigured
the composite stays as a `data:` URI fallback in metadata and
`Post.image_url` stays null; when upload throws the
`composited_image.error_code` captures the failure (operator can
paste a hosted URL manually as before) and text drafts still ship.
Object path is deterministic: `generated/<brand_id>/<sample_group_id>.png` —
siblings share one URL since the composite content is identical.
See `docs/08-deployment.md` "GCS artifact bucket" for the one-time
bucket setup + auth runbook.

**Precedence** (mirrors the text pipeline): Brand Management (base) →
source facts (context) → Event brief (override) → Templates (supporting
library, never authoritative). Event override is per-field —
unspecified fields fall through to Brand defaults. `visual_style` has
no Event override by design (stays brand-level for consistency across
a brand's event lineup).

**Safe zones are first-class.** Each layout template declares explicit
safe zones (quiet / solid_background / gradient_darkened / empty) with
resolution-independent rectangles (0–100% of canvas). The compiler
injects these zones' human-readable descriptions directly into the
positive prompt so the AI leaves them visually quiet, AND echoes them
in the `safe_zone_config` of the compiled output so the overlay
renderer knows where to composite text. The AI is never trusted to
place readable space perfectly on its own.

**Request shape.** One `messages.create` call per generation run. The
provider-agnostic `StructuredPrompt` (from
`src/lib/ai/prompt-builder.ts`) is serialized by
`src/lib/ai/serialize-prompt.ts`:

- `system` carries role-level guardrails (source-fact discipline,
  banned-list enforcement, language-style imitation, output format).
- `user` carries the labeled sections (brand positioning, voice,
  audience, language style, brand notes, restrictions, default
  hashtags, sample captions, platform guidance, source facts, and —
  when event-derived — the event override section). The output schema
  is restated inline with the exact JSON shape and the required sample
  count.
- `messages[]` pre-fills the assistant turn with `{` so Claude emits
  JSON from the first token rather than wrapping it in prose.

**Response parsing.** `src/lib/ai/parse-response.ts` extracts the first
top-level JSON object (handles both raw JSON and accidental
markdown-fenced output), validates against a Zod schema mirroring
`GeneratedSample`, truncates extras, and throws on shortage / schema
drift. The event route catches per-slot so a single bad slot never
poisons the rest of the run.

**Sample count.** Per-source defaults unchanged
(`defaultSampleCount()`); `?samples_per_slot=N` still works on
`/api/events/[id]/generate-drafts`.

**Precedence preserved.** The `StructuredPrompt` is built by the same
prompt builder regardless of provider — Brand Management is the base
layer, Event brief overrides on conflict, Templates & Assets stays a
reusable non-rule supporting library.

**Deferred.**
- Prompt caching (Anthropic's cache_control). Worth adding once we
  have real production volume for the same brand; skipped for MVP.
- Image-generation model selection + wire-up.
- Tool-use / structured-output mode. The assistant-pre-fill + Zod
  combo is reliable enough for current output shape; tool-use is
  lower priority.

### Stub provider as a valid prod fallback

`AI_PROVIDER=stub` (the default) is a fully-supported production
configuration — not just a dev mode. If Anthropic is unreachable for
any reason (billing, outage, rate-limit, account issue), flipping
`AI_PROVIDER` back to `stub` + `pm2 restart --update-env` keeps Generate
Drafts functional with deterministic placeholder samples until the
Anthropic-side issue clears. Drafts produced under the stub are clearly
marked (`(STUB sample N of M)` in captions, `provider=stub` +
`ai_dry_run=true` in `generation_context_json`) so operators can filter
them out of review queues. See docs/08-deployment.md → "AI provider
toggle" for the exact commands.

---

## Output Contract

AI outputs:
- headline
- caption
- CTA
- banner text
- optional image prompt
- optional variations

The system stores the output and lets humans review it.

---

## Manus Publishing — AI Boundary

Manus is the auto-publishing worker. It does not generate content; it delivers an
already-approved content payload to external platforms and reports outcomes.

AI is never invoked at publish or retry time:
- approval does not trigger regeneration
- retry does not regenerate content
- per-platform retry resends the same payload produced at generation/refinement time
- the Manus callback route (`POST /api/manus/callback`) only updates delivery
  rows and reconciles `Post.status` — it never calls the AI layer, regenerates
  content, re-approves, or re-runs source logic

Publishing failures (platform rejection, auth error, rate limit) surface in the
delivery modal with readable error text. Operators retry at the platform level;
the AI layer is not re-entered.

---

## Content Queue Refinement Constraints

Refinement is available ONLY in review-side statuses — **draft**,
**pending_approval**, **rejected**. Once a post is approved (and therefore
scheduled) its content is locked; refinement is not allowed in
`scheduled` / `publishing` / `posted` / `partial` / `failed`. This is the
MVP policy (see docs/06-workflows-roles.md). There is no Return to Review
flow in MVP.

Because content is locked after approval, the AI layer is never re-entered
for an approved post — on retry, the same approved payload is resent
without regeneration, and no approved-payload snapshot is needed.

When an operator opens the Refine Post modal from Content Queue, refinement
instructions may alter **visual style, tone, urgency, and presentation only**.

The following stay fixed across refinement cycles:
- source rules (event mechanics, promo config, big win match logic)
- reward amount
- campaign period / posting schedule
- source snapshot (Hot Games frozen ranked list)
- username logic (masked source for default rule, random for custom rule)

The modal shows a Locked Context panel summarizing the immutable source details
and a universal helper note restating the constraint.

## Multi-sample Draft Grouping

Automations create multiple sibling drafts per scenario (defaults set in
`src/lib/ai/source-normalizers/defaults.ts#defaultSampleCount()`):
- Big Wins: 3 samples per scan
- Running Promotions: 3 samples per promo match
- Hot Games: 2 samples per snapshot
- Events: 1 sample per (occurrence × platform) slot by default; callers
  can pass `samples_per_slot=N` (1–5) for multiple sibling samples
- Educational: 2 samples per packet

Sibling drafts share a `sample_group_id` stored in `generation_context_json` along
with `sample_index` and `sample_total`. The Content Queue reads these to render
a "Sample N/M" chip and a shared left-edge accent color so operators can recognize
siblings at a glance. No dedicated column — the existing JSON field is reused.

---

## Sample Brief Panel (Create Event page)

The Create Event page shows a right-side Sample Event Brief panel for operator
guidance. Samples come from a hardcoded list of 6 coherent example briefs — not
from AI, not from BigQuery, not from the event record being created. The panel
is reference-only; it does not fill the form, does not copy values into any
event record, and is not sent as AI input at event creation time.
Required form fields remain manual and mandatory.

---

## Shared BigQuery Data Source

Automation scans (Big Wins, Hot Games) read from the shared BigQuery dataset
maintained by the platform team. AI consumes pre-computed facts — not raw queries.

- AI receives a structured packet assembled by the backend from BQ rows.
- AI never executes SQL, never sees raw rows, never fetches data itself.
- Column references are centralized in a single adapter. Schema changes are
  absorbed there, not in the AI input layer.
- Live adapters shipped 2026-04-23:
  - `src/lib/big-wins/` — produces `BigWinFacts[]` (pre-masked)
  - `src/lib/hot-games/` — produces a single frozen `HotGamesFacts` snapshot
  - Both are missing-table-tolerant (`status: "missing"`) while
    `shared.game_rounds` is still being provisioned by the platform team.
    Normalizer self-checks exercise the AI-fact shape in isolation, so
    shape regressions are caught today, independent of live-table timing.

### Running Promotions live source

Unlike Big Wins + Hot Games, Running Promotions does **not** come from
the shared BigQuery dataset — each brand has its own promo API. The
live adapter (`src/lib/promotions/`, landed 2026-04-22) reads
`api_base_url` + `promo_list_endpoint` (+ optional
`external_brand_code`) from `Brand.integration_settings_json` and
returns `PromoFacts[]` — the exact shape the fixture at
`src/lib/ai/fixtures/promo.ts` produces. Callers loop over the
returned promos and feed each through the existing
`normalizePromo()` normalizer, so nothing downstream changes.

The AI layer is still source-clean: the adapter runs backend-side,
validates defensively, sends nothing to the model until normalized
`PromoFacts` are handed off through the normal generation pipeline.
The fixture is kept and is drop-in replaceable with
`fetchPromotionsForBrand()` — useful for dev and for admin-triggered
fixture runs from `/api/ai/generate-from-fixture`.

### Username in Big Wins content
Username is a display handle chosen by the user (not PII under the guide's
definition). Big Wins default-rule drafts use the source `username` from
`shared.users`, scoped by `brand_id`, then apply `maskUsername()` before display.
Custom-rule drafts continue to use generated random usernames.
Effective identity for deduplication is `(username, brand_id)` since the same
username can exist across brands.

---

## Hot Games Frozen Snapshot

Hot Games drafts store a frozen ranked-games snapshot in Post.generation_context_json at
scan time. When a Hot Games draft is refined from Content Queue, the AI reuses that
snapshot — it must NOT trigger a new API scan and must NOT replace the games list.
The snapshot includes scan timestamp, source window, ranked games, and time mapping.
This preserves the original ranked batch across refinement cycles.

---

## Event Campaign Brief Context

When refining event-derived posts, the AI receives a structured brief from the source event:
- theme, objective, rules, reward
- target_audience, cta, tone
- platform_scope, notes_for_ai
- posting instance summary and occurrence datetime

The AI uses this context for content generation and refinement.
Event-derived drafts remain constrained by the original event rules during refinement.
Editing a queue draft must NOT change event recurrence or campaign rules.
The actual AI generation is not yet implemented — only the data architecture and context resolution.

---

## Guardrails

- backend is source truth
- AI is never source truth
- do not let prompt design replace business logic
- keep token use low by loading only task-relevant docs
