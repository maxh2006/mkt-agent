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
text only — image rendering remains deferred; no image model is locked.

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
