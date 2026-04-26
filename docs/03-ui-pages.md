# 03-ui-pages.md

## UI Goal

Desktop-first operator dashboard.
Simple, fast, preview-heavy, multi-brand aware.

---

## Global Layout

### Top Bar
- logo
- brand switcher
- global search
- notifications
- user menu

### Sidebar
- Overview
- Content Queue
- Calendar
- Events
- Automation Rules
- Templates & Assets
- Insights
- Channels
- Brand Management
- Users & Roles
- Audit Logs

---

## Page Definitions

### Overview
Show:
- pending approval
- scheduled today
- posted today
- failed posts
- active automations
- recent warnings

### Content Queue
Main working page.

Columns:
- Brand (All Brands mode), Thumbnail, Preview, Status, Type, Platform, **Schedule**, Scheduled, Created, Actions.
- Schedule column replaces the old Recurrence column and shows window + cadence:
  - `"Apr 1 – Apr 30 • Daily 3:00 PM"` (event with posting instance)
  - `"Apr 1 – Apr 30 • Generate Now • One-time"` (event in Generate Now mode)
  - `"Always-on • Big Win automation"` / `"Always-on • Hot Games scan"` (long-running rule-based drafts)
  - `"—"` otherwise
- Type filter now includes **Hot Games** in addition to Running Promotion / Big Win / Adhoc Event / Educational.
- Sample group chip appears in the preview cell when sibling drafts share a `sample_group_id`
  (e.g. "Sample 1/3"). Siblings also share a thin colored left border for subtle visual grouping.

Edit modal (renamed to "Refine Post"):
- Available only for review-side statuses: **Draft**, **Pending Approval**,
  **Rejected**. Approved posts are locked and cannot be refined in MVP
  (see docs/06-workflows-roles.md for policy).
- Row-level gating: the Refine action button is hidden on rows whose status
  is outside the allow-list.
- Modal-level gating: as a defense-in-depth, the modal itself detects
  non-allowed statuses and renders a locked explainer panel
  ("Approved posts cannot be refined in MVP…") instead of the refinement form.
- Locked Context panel at the top shows source type, event title (if applicable), schedule summary,
  Hot Games snapshot summary (if applicable), and a source-specific reminder.
- Instruction textarea + universal note: "You may refine visual style, tone, and presentation.
  Fixed rules, reward, timing, and source context will remain unchanged."
- CTA renamed to "Apply Refinement".

Post detail:
- Source ID links to the source event for event-derived posts.
- Rejection block now shows rejected_at timestamp and rejected_by (in addition to reason).
- **Image URL field** (2026-04-23): editable when post is in Draft or Rejected (same gate as other fields). Helper text: "Public URL for publishing. Must be reachable (http or https). Leave blank for text-only posts." The field is an optional URL up to 2048 chars; syntactic sanity is enforced by the post Zod schema, and full public-URL reachability is enforced pre-dispatch by `src/lib/manus/media-validation.ts`. The post preview at the top of the page renders the image when `image_url` is set (with a broken-image fallback to the banner_text placeholder if the browser fails to load it — this is a browser CORS / hotlink resilience concern, not a validation signal).

Row actions (target model — refine per implementation):
- Core (visible): View, Refine, Approve (or Approve & Post when immediate), Reject
- Secondary / overflow: View Delivery, Retry Failed, Audit History (later)
- Destructive actions never fire silently from a dropdown — confirm where needed.

Delivery Status modal:
- Opened via the "View Delivery" row action (Send icon) — shown when the post has
  entered the delivery lifecycle (scheduled / publishing / posted / partial / failed).
- Shows one row per delivery with: platform, delivery status chip, scheduled time,
  publish attempted time, posted_at / external_post_id on success, last_error /
  retry_count on failure.
- **Failure classification chip** (2026-04-23): each failed row shows a
  retryability chip alongside the error text:
  - `Retryable` (amber) — transient code (NETWORK_ERROR / RATE_LIMITED /
    TEMPORARY_UPSTREAM_ERROR). Retry button visible.
  - `Retryable (cause unknown)` (muted) — UNKNOWN_ERROR, missing code, or
    legacy text-only row. Retry button visible (operator has agency).
  - `Fatal — fix first` (red) — fatal code (AUTH_ERROR / INVALID_PAYLOAD /
    MEDIA_ERROR / PLATFORM_REJECTED). Retry button is replaced with
    "Fix required" text; operator must correct content/config before any
    retry makes sense.
  See `docs/06-workflows-roles.md` → "Delivery retry classification" for
  the full taxonomy and backend-gate behaviour (422 on fatal retry).
- Retry All button in the footer is labelled **Retry All Retryable**
  (only when >1 retryable failure exists) and skips fatal rows.
- Retry resets a delivery to `queued` with `scheduled_for = now()`, bumps
  `retry_count`, clears `last_error`, and writes a `delivery.retried` audit
  entry. It reuses the same approved content payload — no regeneration, no
  re-approval. Cloud Scheduler picks up the requeued delivery on the next
  dispatcher tick.
- A short helper note under the deliveries table reinforces the same-payload
  guarantee whenever there is at least one failed delivery. When any fatal
  failure is present, a second red-text line tells the operator fatal
  failures require a content/config fix outside the modal.
- When no delivery rows exist yet (post freshly scheduled, Manus hasn't dispatched),
  the modal shows an informational empty state.

Approval UX:
- **Approved is not a visible status.** The Approve action records approval
  metadata (`approved_at`, `approved_by`) and transitions the post straight to
  **Scheduled**. If no `scheduled_at` was pre-set, approval uses `now()` as the
  publish time.
- Status filter no longer offers "Approved". Visible statuses:
  Draft / Pending Approval / Scheduled / Publishing / Posted / Partial / Rejected / Failed.

Filters:
- brand
- status
- platform
- post type
- date
- source

Actions:
- preview
- edit
- approve
- reject
- regenerate
- duplicate
- archive

### Post Detail / Preview
Show:
- headline
- caption
- CTA
- banner text
- image prompt
- source data
- brand/platform preview

Actions:
- save draft
- approve
- approve and schedule
- reject
- regenerate copy
- regenerate banner idea

### Calendar
Day/week/month views for scheduled posts.

### Events (Campaign Briefs)
Structured form for adhoc campaigns. Events are AI-ready campaign briefs.

Create form includes:
- A. Event Details — title, type, theme, dates, objective, rules, reward
- B. Campaign Brief — target audience, CTA, tone, platform scope, notes for AI
- C. Posting Schedule — frequency: Generate Now / Daily / Weekly / Monthly. "Generate Now" hides recurrence controls and auto-generate toggle (it is the explicit intent).
- D. Auto-generate toggle (hidden in Generate Now mode)
- **E. Visual Override (Simple Mode)** (UI shipped 2026-04-27). Operator
  fills ONLY the fields that differ from Brand defaults for this specific
  event; everything unspecified falls through to the brand. Persists
  into `Event.visual_settings_json` (nullable JSONB; migration
  `20260427150000_event_visual_settings_json`). Validated server-side
  via `eventVisualOverrideSchema` from `src/lib/ai/visual/validation.ts`,
  wired through `createEventSchema` / `updateEventSchema` in
  `src/lib/validations/event.ts`. Controls (each Select offers an
  explicit "Use brand default" first item to clear an override):
  - `visual_emphasis` (Select, optional) — reward-forward / winner-forward /
    game-forward / brand-forward / lifestyle
  - `main_subject_type` (Select, optional) — human / object / game-element /
    symbol / abstract
  - `layout_family` (Select, optional) — center_focus / left_split /
    right_split / bottom_heavy
  - `platform_format` (Select, optional) — square / portrait / landscape / story
  - `negative_visual_elements` (TagInput, max 20) — layered on top of brand-
    level negatives at compile time
  - `visual_notes` (textarea, optional, max 200 chars) — short stylistic
    nudge, NOT a prompt
  `visual_style` intentionally has no Event override — stays brand-level
  for consistency across the brand's event lineup. The new shared
  `TagInput` component lives at `src/components/ui/tag-input.tsx`. Empty
  override blocks round-trip as `null` so payloads stay clean. The Event
  detail page renders a read-mode summary listing only the overridden
  fields (or "Using brand defaults — no event-level overrides." when
  empty). `coerceEventVisualOverride()` from
  `src/lib/ai/visual/validation.ts` is the tolerant reader; out-of-enum
  legacy values are silently dropped on load so operators can re-pick
  rather than seeing the form crash. **Active in generation
  (2026-04-27)**: saved overrides now flow into the live AI generation
  pipeline via `compileVisualPrompt()` — only fields the operator
  explicitly sets override the brand defaults; everything else falls
  through. The audited override list (`overridden_by_event`) is
  persisted on every event-derived draft. **Background-image provider
  active (2026-04-27)**: every generated draft also carries a
  `generation_context_json.image_generation` block (status / artifact
  metadata). The first real provider — Nano Banana 2
  (`gemini-3.1-flash-image-preview`) — is wired and ready to flip on
  per `docs/08-deployment.md`; until then the safe-prod default
  remains the stub. When the real provider runs, `artifact_url` is a
  `data:image/png;base64,…` URI containing the AI-generated background.
  **Overlay renderer active (2026-04-27)**: every generated draft
  ALSO carries `generation_context_json.composited_image` — Post text
  + brand logo composited onto the AI background (or onto a brand-
  color fallback when no AI artifact is available). Layout / safe
  zones / logo slot all sourced from the layout spec. The composite
  is also a `data:image/png;base64,…` URI in MVP. **`Post.image_url`
  remains intentionally untouched** — Manus dispatch only accepts
  http(s) URLs, so auto-population of that field is gated on the GCS
  storage migration follow-up. Operators continue to paste a hosted
  image URL manually for posts they want to publish today.

Right-side panel on the Create page: **Sample Event Brief** — reference-only guidance.
Shows 8 rows (Theme, Objective, Rules, Reward, Target Audience, CTA, Tone, Notes for AI)
pulled from a hardcoded list of coherent example briefs. A "Generate Sample Prompt" button
picks a new example on each click. The panel does NOT fill any real form fields;
operators type their own values. Required field enforcement is unchanged.

On the Create page, the primary button label is "Create Event & Generate Drafts Now" when Generate Now is selected; otherwise "Create Campaign Event". Submitting with Generate Now creates the event and immediately triggers draft generation into Content Queue for review.

Detail page shows all sections with inline editing. "Generate Drafts" button creates drafts in Content Queue from the posting schedule. Since 2026-04-21 (Phase 4 AI generator), each (occurrence × platform) slot runs through the AI pipeline (`src/lib/ai/generate.ts#runGeneration`), producing a real draft with headline/caption/CTA/banner/image_prompt — not an empty shell. On 2026-04-22 the Anthropic Claude provider was wired behind the boundary: `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` produces real AI copy; `AI_PROVIDER=stub` (default) remains a safe no-cost placeholder. Pass `?samples_per_slot=N` (1–5) to generate multiple sibling samples per slot. Image generation is still deferred — the provider emits an `image_prompt` string; no image files are rendered yet.

Event statuses: active, ended, archived (no draft). Lifecycle auto-managed.

### Automation Rules
Rules-only configuration page with 3 tabs:
- **Big Wins** — batch snapshot mode, check frequency, draft cadence, default/custom rules,
  username masking, content output rules, deduplication
- **On Going Promotions** — API-based promo detection, weekly check schedule, per-promo rule
  creation with posting mode (start/daily/weekly/monthly), recurrence config, draft delay
- **Hot Games** — top RTP games from source window, fixed time mapping (6-11 PM),
  single-post output containing all ranked games, scan deduplication
All matched rules create drafts in Content Queue for operator review.

### Templates & Assets

**Reusable library of supporting material** — copy patterns, CTA snippets,
banner text, prompt scaffolds, and reference assets. Operators and the
future AI content generator draw from these as reusable building blocks.

**This page is NOT a rule source.** Base AI rules (positioning, tone,
language, audience, banned lists, brand notes) live in Brand Management;
event briefs are the situational override layer. Templates & Assets sits
alongside those as a reusable supporting library — see
docs/07-ai-boundaries.md for the full AI context precedence model. A
small callout on the page itself restates this so operators don't
duplicate brand rules here.

Tabs (reordered 2026-04-22 to match the library mental model):

1. **Copy Templates** (`caption`) — reusable caption structures and post
   shapes the AI can pull from as scaffolds. Save the pattern, not the
   exact wording.
2. **CTA Snippets** (`cta`) — reusable call-to-action lines the AI can
   drop into drafts.
3. **Banner Text Patterns** (`banner`) — short overlay-text patterns
   (2–6 words) used on banner/image creatives.
4. **Prompt Templates** (`prompt`) — image-generation prompt scaffolds
   the AI can reuse across creatives.
5. **Reference Assets** (`asset`) — reusable visual reference URLs.
   **Distinct from Brand Management's benchmark assets** — benchmarks
   define base brand identity; reference assets here are operational
   library material (cross-content references like recurring mascots,
   reusable background elements).

DB enum values (`caption`/`banner`/`prompt`/`cta`/`asset`) are unchanged —
only operator-facing labels, order, and helper text were refreshed.

Per-entry fields:
- `name` (required) — library identifier.
- Text types: `content` (required, min 1 char, max 5000) + optional
  `notes` (usage guidance).
- Reference assets: `url` (required, must be a valid URL) +
  `asset_type` (image / logo / banner) + optional `notes`. Direct file
  upload is not wired; paste a hosted URL.
- `active` toggle — inactive entries are hidden from AI reuse.
- Global vs brand-scoped: global templates (`brand_id=null`) are
  read-only in the UI; admin-managed seeds. Brand-scoped templates are
  editable by brand_manager+.

Each tab shows a short helper line restating that tab's reusable role,
and the dialog echoes the same helper to remind operators what belongs
there vs. in Brand Management. Content placeholders are concrete and
token-style (e.g. `{player_handle}`, `{win_amount}`) to communicate the
"pattern, not wording" expectation.

**AI retrieval (as of 2026-04-22):** the AI generator automatically
pulls active entries into every generation run via
`src/lib/ai/load-templates.ts`. Brand-scoped entries come first (most
recently updated), then globals top up. Per-type caps bound the amount
injected — `copy=3, cta=5, banner=5, prompt=3, asset=5`. Operators
don't have to configure retrieval; toggling an entry to Inactive
excludes it from future generations. No per-entry UX changes to this
page.

### Insights
Lightweight internal metrics only.

### Channels
Per-brand account connections and status.

### Brand Management
Admin-only module. Shows a list of all brands.

**This page is the base AI profile for each brand.** Adhoc event briefs
override brand rules when there is a conflict. A short callout at the top of
the Add/Edit dialog restates this; the main page header says the same.

Filters:
- Search by name (server-side, case-insensitive)
- Status (Select) — `Status: All` (default), `Status: Active`, `Status: Inactive`
- Brand multi-select (DropdownMenu with checkbox rows) — default `All Brands`; multi-select narrows the visible list client-side

Each brand card shows: name, active status, integration badge, positioning
statement (truncated to 2 lines), domain, API base URL, color swatches,
last updated.

"Add Brand" and "Edit" open a tabbed form dialog with five tabs. Required
fields are marked with `*`; the form jumps to the offending tab on validation
error.

- **A. Identity**
  - Brand Name (required) — e.g. "Lucky Casino"
  - Domain (required) — e.g. `luckycasino.com`
  - Brand Positioning Statement (required, 50–200 chars) — single-sentence
    positioning anchor used as the default rule on every AI generation call.
    Stored in `voice_settings_json.positioning`.
  - Logos — 4 slots (Main / Square / Horizontal / Vertical) with drag-and-drop
    upload zones. Client-side validation: PNG only, ≥500×500, ≤5 MB. Previews
    render from FileReader. **Direct file storage is not wired in this build**
    — a URL text input under each zone is what actually persists. Helper
    constraints callout + per-zone description explain the four intended uses.
  - Brand Colors (required) — Primary / Secondary / Accent hex pickers with a
    helper line explaining these drive brand identity, image design tone,
    and CTA / emphasis / layout accents.
  - Active brand toggle.
- **B. Integration**
  - Integration enabled toggle.
  - **BigQuery Details** (callout explaining shared global source):
    External Brand ID / Source Brand Code, Source Mapping Notes — both
    optional. No per-brand BigQuery endpoints; Big Wins and Hot Games read
    from the shared dataset.
  - **API Details**: API Base URL, Promo List Endpoint (Running Promotions
    still fetch per-brand from the brand's own API), Tracking Link Base URL.
- **C. Voice & Tone** — the AI base rule. All required except the tag lists.
  - Tone (Select, required)
  - CTA Style (Select, required)
  - Emoji Level (Select, required)
  - Language Style (free text, required) — replaces old enum; describe the
    exact mix (e.g. "Casual Taglish", "English only")
  - Language Style Sample (required) — one sentence in the desired voice
    the AI will imitate
  - Audience Persona (required) — who the brand talks to
  - Notes for AI (required) — nuance bucket for guidance that doesn't fit
    above fields
  - Banned Phrases (tag input) — word-level blocks
  - Banned Topics (tag input) — category-level guardrails (new in 2026-04-21)
  - Default Hashtags (tag input)
- **D. Design**
  - **Simple Mode Visual Defaults** (UI shipped 2026-04-27, primary path).
    Structured pickers feeding the hidden prompt compiler at
    `src/lib/ai/visual/compile.ts`. Operators do NOT author detailed
    visual prompts. Persisted into `Brand.design_settings_json.visual_defaults`
    (no migration — JSON column already exists). Validated server-side
    via `brandVisualDefaultsSchema` from `src/lib/ai/visual/validation.ts`,
    wired through `designSettingsSchema` in `src/lib/validations/brand.ts`.
    - `visual_style` (Select, required) — photographic / illustrated / 3d /
      vector / cinematic / minimalist
    - `visual_emphasis` (Select, required) — reward-forward / winner-forward /
      game-forward / brand-forward / lifestyle
    - `main_subject_type` (Select, required) — human / object / game-element /
      symbol / abstract
    - `layout_family` (Select, required) — center_focus / left_split /
      right_split / bottom_heavy
    - `platform_format_default` (Select, required) — square / portrait /
      landscape / story
    - `negative_visual_elements` (TagInput, max 20) — "do-not-include" list,
      enforced as negative_prompt at generation time
    - `visual_notes` (textarea, optional, max 200 chars) — short stylistic
      nudge, NOT a prompt
    A short framing line at the top of the tab states: "These settings
    define the default visual style this brand prefers. Event-level visual
    settings can override them when needed." The form seeds
    `DEFAULT_BRAND_VISUAL_DEFAULTS` from
    `src/lib/ai/visual/validation.ts` for new brands or legacy brands
    without a `visual_defaults` block. `coerceVisualDefaults()` in
    `src/app/(app)/brands/page.tsx` is tolerant of out-of-enum values
    on read — falls back to canonical defaults rather than rejecting.
    **Active in generation (2026-04-27)**: saved values now feed the
    live AI generation pipeline via `compileVisualPrompt()` — the AI's
    narrative `image_prompt` is steered to align with these cues, and
    the compiled visual artifacts are persisted on every generated
    draft for the future image-rendering provider + overlay renderer.
  - Benchmark Assets repeater — upload banner samples / mascots / recurring
    visual cues for AI image reference. Same upload-storage caveat as logos:
    the URL input persists, drag-drop is preview-only in this build.
  - **Legacy free-text design notes (deprecated)** — collapsed `<details>`
    section under Visual Defaults. Six free-text fields predating Simple
    Mode (`design_theme_notes`, `preferred_visual_style`, `headline_style`,
    `button_style`, `promo_text_style`, `color_usage_notes`) remain
    readable + editable for backward compatibility but are no longer the
    authoritative visual rule source. New brands should leave these blank.
    A clear "deprecated" chip + amber border + helper line communicate the
    transition. Empty strings are not stored — unset fields are omitted
    from the JSON. Removal is a follow-up once operators have migrated.
    See `docs/07-ai-boundaries.md` → "Visual input architecture" for the
    product rule and precedence.
- **E. Sample Captions** — repeater of `{ title, type, text, notes }`.
  `title` and `text` are now **required**. A per-card Clone button copies an
  existing caption as a template for faster entry.

Admin role only can create or edit brands. Non-admin roles are read-only
(Brand Management page not shown in nav for non-admins — accessed via brand
switcher only).

### Users & Roles
Simple role assignment with brand scope.

### Audit Logs
Track critical changes.

---

## UI Rules

- Always show current brand clearly
- Use structured inputs
- Keep operator actions obvious
- Use status badges and filters
- Show previews before approval
- Avoid hidden workflows
