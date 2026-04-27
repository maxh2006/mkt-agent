# ROADMAP.md

Structured master roadmap for the project. This supersedes the interim to-do
list previously at the top of WORKLOG.md.

Use this roadmap to guide planning and execution. Do not overengineer. Keep MVP
pragmatism.

---

## PHASE 1 — STABILIZE CURRENT OPERATOR PLATFORM

Goal:
Finish aligning the existing backoffice so it is operationally consistent
before deeper integrations.

Includes:
1. Audit Templates & Assets
2. Audit Insights
3. Audit Channels
4. Audit Brand Management
5. Audit Users & Roles
6. Audit Audit Logs
7. Re-check Queue / Calendar / status semantics
8. Re-check source-constrained refine behavior
9. Re-check grouped draft/sample visibility
10. Re-check All Brands readability across pages

Definition of done:
- no major workflow confusion across main backoffice pages
- operator-facing wording is clean
- statuses are consistent
- review / refine / approve / schedule / delivery visibility all make sense

---

## PHASE 2 — COMPLETE MANUS PUBLISHING LIFECYCLE

Goal:
Turn the platform from review-only into full review + publish operations.

Includes:
1. ~~Build Manus callback / webhook route~~ — **Done 2026-04-21.** `POST /api/manus/callback`, HMAC-signed.
2. ~~Create PostPlatformDelivery rows at approval / scheduling time~~ — **Done 2026-04-21.** `ensureDeliveriesForPost()`.
3. ~~Wire post-level status reconciliation using computePostStatusFromDeliveries()~~ — **Done 2026-04-21.** `reconcilePostStatus()`.
4. ~~Add View Delivery button on post detail page~~ — **Done.** Row-level + modal are live in Content Queue.
5. ~~Wire actual retry redispatch~~ — **Done 2026-04-21.** Dispatcher + Cloud Scheduler pick up requeued rows automatically; audit-logged.
6. ~~Set up Cloud Scheduler for /api/jobs/dispatch~~ — **Done 2026-04-21.** Job `mkt-agent-dispatch` in `asia-east2`, firing every 2 min.
7. ~~Finalize Manus credentials and response protocol~~ — **Done 2026-04-21.** Dispatch response shape, callback payload, correlation keys, error taxonomy, idempotency — see docs/00-architecture.md "Manus protocol — finalized contract".
8. ~~Add signed callback verification~~ — **Done 2026-04-21.** HMAC-SHA256 over raw body with `MANUS_WEBHOOK_SECRET`.
9. ~~Decide whether refine-after-approval is allowed~~ — **Decided 2026-04-21: NO in MVP.** Enforced in UI (Queue row gating + EditPostModal defensive lockout) and server (PATCH `/api/posts/[id]` only accepts draft/rejected). See docs/06-workflows-roles.md.
10. ~~Add approved payload snapshot if refine-after-approval is allowed~~ — **Deferred** under the locked "no refine-after-approval" policy; dispatcher safely reads live Post fields at dispatch and retry.

**Phase 2 status: all original items resolved.** Remaining "go-live" work
(wiring `MANUS_AGENT_ENDPOINT` to a real Manus instance, rotating
secrets, upgrading the Cloud Scheduler target from raw HTTP to HTTPS
behind a domain) is operational, not product scope — tracked in
docs/08-deployment.md.

**Post-resolution hardening** — bridge work landed between original
Phase 2 sign-off and live Manus traffic:
1. ~~AI provider toggle + stub rollback playbook~~ — **Done 2026-04-22.** `AI_PROVIDER=stub|anthropic` env switch at `src/lib/ai/client.ts`; 60-second flip-back procedure in docs/08-deployment.md.
2. ~~Retryable vs fatal delivery failure classification~~ — **Done 2026-04-23.** `src/lib/manus/retryability.ts` parses `[CODE]` prefix from `last_error`; retry route returns 422 on fatal; Delivery Status modal shows "Retryable" / "Retryable (cause unknown)" / "Fatal — fix first" chips.
3. ~~Platform-specific handoff payload mapping~~ — **Done 2026-04-23.** `src/lib/manus/platform-payload.ts` produces a `PublishPayload` discriminated union per platform (facebook / instagram / twitter / tiktok / telegram) alongside the existing flat `content` block.
4. ~~Pre-dispatch media URL validation~~ — **Done 2026-04-23.** `src/lib/manus/media-validation.ts` — syntactic + scheme + host-privacy + reachability (HEAD with GET-Range fallback). Failures mark delivery failed with `[MEDIA_ERROR] <reason>`, route through the fatal path. `npm run media:smoke`.
5. ~~`Post.image_url` field + UI/API/handoff plumbing~~ — **Done 2026-04-23.** Migration `20260423120000_post_image_url` (nullable TEXT); Zod-validated; editable on queue detail; `collectMediaUrls()` live-sourced. Activates the pre-dispatch validation for real traffic.

**CI / deploy infrastructure** (operational but worth noting):
- GitHub Actions typecheck workflow — `.github/workflows/ci.yml` (Node 22, `prisma generate` → `tsc --noEmit`). 2026-04-23.
- Root-owned deploy model on the VM via `scripts/deploy.sh`. Documented in docs/08-deployment.md.

Target lifecycle:
- Draft
- Pending Approval
- Scheduled
- Publishing
- Posted
- Partial
- Failed
- Rejected

Definition of done:
- approved content can be published by Manus
- delivery is visible per platform
- failed platforms can be retried safely
- post-level status reflects actual platform outcomes

---

## PHASE 3 — FINALIZE DATA SOURCE LAYER

Goal:
Complete the source integration architecture cleanly.

Source split:
- Big Wins → BigQuery
- Hot Games → BigQuery
- Running Promotions → API

Includes:
1. ~~Confirm BigQuery access/auth is stable~~ — **Done 2026-04-22.** SA impersonation wired at `src/lib/bq/client.ts`; billing pinned to `mktagent-493404`; unqualified-table guardrail + `npm run bq:smoke` end-to-end verified against `shared.brands` / `users` / `transactions` / `games`.
2. ~~Finalize Big Wins BQ field mapping~~ — **Done 2026-04-23.** `src/lib/big-wins/` — types + query + normalize + adapter; emits `BigWinFacts[]` + applies `maskUsername()`; admin preview route + `npm run big-wins:preview` CLI; missing-table tolerant.
3. ~~Finalize Hot Games BQ field mapping~~ — **Done 2026-04-23.** `src/lib/hot-games/` — ranked aggregation (static RTP + round_count tie-break) + frozen-snapshot `HotGamesFacts`; admin preview + `npm run hot-games:preview` CLI; input-validates time mapping before any BQ call.
4. ⏳ **Confirm username/display handle availability in shared.users** — **Blocked** on platform team provisioning `shared.game_rounds`. Adapter code uses `shared.users.username` scoped by `brand_id` and applies `maskUsername()`; live end-to-end confirmation pending the missing table.
5. ⏳ **Finalize dedupe keys for Big Wins** — **Blocked** on same. Adapter uses derived `bq-big-win-<user>-<timestamp>-<payout>` until platform confirms whether a real `win_id` column exists; swap is a one-line change in `src/lib/big-wins/normalize.ts`.
6. ~~Keep schema adapter / mapping layer isolated~~ — **Done 2026-04-22.** `src/lib/bq/shared-schema.ts` exports `SHARED_TABLES` + `SHARED_PROJECT` + `SHARED_DATASET`; `src/lib/bq/shared-types.ts` holds `GameRoundRow`, `UserRow`, etc; `runQuery()` guardrail rejects unqualified refs at the boundary.
7. ~~Keep Running Promotions on separate operational API~~ — **Done 2026-04-22.** `src/lib/promotions/` — per-brand REST adapter (not BigQuery) consuming `Brand.integration_settings_json`; tolerant Zod parser accepts envelope + bare-array shapes; admin preview + `npm run promotions:preview` CLI.
8. ⏳ Avoid leaking raw schema assumptions into UI/rule configs — no known active leaks (all UI + rule-config code goes through the adapter layer), but no explicit audit yet.

Definition of done:
- backend knows how to fetch candidate facts cleanly from each source ✅
- rule engine stays source-agnostic ✅
- schema volatility is contained in mapping/adapters only ✅

---

## PHASE 4 — BUILD THE AI CONTENT GENERATOR AGENT

Goal:
Build the real content-generation engine that turns source/context into
queue-ready drafts.

Includes:
1. ~~Prompt/context builder — Big Wins / Running Promotions / Hot Games / Adhoc Events / Educational~~ — **Done 2026-04-21.** `src/lib/ai/prompt-builder.ts` + per-source `src/lib/ai/source-normalizers/*`; typed `SourceFacts` discriminated union covers all 5 types.
2. ~~Draft generation flow (multiple samples, source-aware grouping, insert into Content Queue)~~ — **Done 2026-04-21.** `src/lib/ai/generate.ts#runGeneration()` orchestrator; per-source sample_count defaults (big_win=3, promo=3, hot_games=2, event=1, educational=2); shared `sample_group_id` + `sample_index`/`sample_total` in `generation_context_json`.
3. ~~Source-constrained refine flow~~ — **Policy-locked 2026-04-21: NO refine after approval.** Refine allowed only in Draft / Pending Approval / Rejected. Fixed source rules / reward / campaign period / snapshot never change. Enforced in row gating, modal, and server PATCH. See docs/06-workflows-roles.md.
4. 🟡 **Image generation pipeline — structured inputs + split rendering** (near-term priority as of 2026-04-23)

   Why now: operators are struggling with prompt-heavy inputs; we do
   NOT want them to become prompt engineers. AI-rendered typography is
   unreliable for branded overlays (reward amount, banner text, logo).
   The image-rendering provider must land AFTER this foundation, not
   before — otherwise we'd build the provider against the wrong input
   surface and have to rework it.

   Supporting plumbing already shipped 2026-04-23: `Post.image_url`
   column + pre-dispatch URL validation + queue detail edit UI +
   preview image render (operators can paste a hosted image URL today).

   Scope — land these before wiring an image-rendering provider:

   1. ✅ **Simplify Brand Management visual defaults** — **Done 2026-04-27.** Structured enums (`visual_style`, `visual_emphasis`, `main_subject_type`, `layout_family`, `platform_format_default`, `negative_visual_elements`, optional `visual_notes`) live in [`src/lib/ai/visual/types.ts`](src/lib/ai/visual/types.ts) + [`src/lib/ai/visual/validation.ts`](src/lib/ai/visual/validation.ts). Brand Management → Design tab Simple Mode UI persists into `Brand.design_settings_json.visual_defaults`; validated through `designSettingsSchema` in `src/lib/validations/brand.ts`. Legacy free-text design notes kept readable + editable as a collapsed deprecated section (removal is a follow-up once operators have migrated).
   2. ✅ **Simplify Event visual override inputs** — **Done 2026-04-27.** Per-field-optional `EventVisualOverride` with the same controls as Brand (minus `visual_style`, which stays brand-level for cross-event consistency). UI shipped on Events Create + Detail pages; persists into new `Event.visual_settings_json` JSONB column (migration `20260427150000_event_visual_settings_json`). Validated through `eventVisualOverrideSchema` wired into `createEventSchema` / `updateEventSchema`. `coerceEventVisualOverride()` provides defence-in-depth on read. Shared `TagInput` extracted to `src/components/ui/tag-input.tsx`.
   3. ⏳ **Replace freeform prompt-heavy inputs with structured controls** across the app — audit pending after Brand + Event UI rollouts land.
   4. ✅ **Hidden prompt compiler** — **Done 2026-04-23, wired into live generation 2026-04-27.** [`src/lib/ai/visual/compile.ts#compileVisualPrompt()`](src/lib/ai/visual/compile.ts). Merges Brand ← Event per-field, resolves platform format (Event > platform-appropriate > Brand default), derives subject focus from source facts when available, composes positive prompt with safe-zone instructions, composes negative prompt anchored on a hardcoded baseline (no text / letters / typography / logos drawn / watermarks / signage). `render_intent` locked to `"ai_background_then_overlay"`. Operators never see the compiled prompt. As of 2026-04-27 the compiler is now called inside [`runGeneration()`](src/lib/ai/generate.ts) — Brand `visual_defaults` + Event `visual_settings` thread through `BrandContext` / `EventOverride`, the prompt builder gets a new "Visual Direction" section, `PROMPT_VERSION` is `v3-2026-04-27`, and every generated draft carries a `generation_context_json.visual_compiled` block (layout_key, safe_zone_config, render_intent, platform_format, visual_emphasis, subject_focus, effective_inputs, background_image_prompt, negative_prompt) ready for the future image-rendering provider + overlay renderer. Verified via `npm run visual:smoke` (27/27 assertions across 6 cases).
   5. ✅ **Layout template specs + safe-zone rules** — **Done 2026-04-23.** [`src/lib/ai/visual/layouts.ts`](src/lib/ai/visual/layouts.ts). Four canonical templates (`center_focus`, `left_split`, `right_split`, `bottom_heavy`) with resolution-independent text zones, safe zones (quiet / solid_background / gradient_darkened / empty), logo slot, optional gradient overlay, CTA alignment, and emphasis area. `resolveLayout(preferred, format)` handles format-incompatibility fallback.
   6. ✅ **Deterministic text + logo overlay rendering** — **Shipped 2026-04-27.** New module [`src/lib/ai/render/`](src/lib/ai/render/) — Satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG). Composites Post.headline / caption / cta / banner_text + brand logo onto the AI-generated background using the layout's text zones / safe zones / logo slot from `visual_compiled.safe_zone_config`. One composite per generation run; replicated to every sibling draft via `generation_context_json.composited_image`. Bundled Open Sans Regular + Bold TTFs (OFL) under `public/fonts/`. Brand-color solid fallback when AI artifact is missing. SSRF-safe brand-logo fetch via existing `isPrivateHost` guard. `npm run render:smoke` produces a sample PNG without DB / network. **`Post.image_url` is STILL intentionally not touched** — Manus dispatch needs http(s) URLs; the GCS storage migration is the follow-up that promotes both `image_generation.artifact_url` and `composited_image.artifact_url` from data URIs to hosted URLs and AT THAT POINT auto-populates `Post.image_url`.

   7. ✅ **Image-rendering provider adapter (background only)** — **Boundary shipped 2026-04-27 with first real adapter.** New module [`src/lib/ai/image/`](src/lib/ai/image/) (`types.ts` + `client.ts` + `gemini.ts`) mirrors the text-provider boundary. `AI_IMAGE_PROVIDER=stub` is the default; `AI_IMAGE_PROVIDER=gemini` activates the **Nano Banana 2** adapter (developer model `gemini-3.1-flash-image-preview`) using `GEMINI_API_KEY` from Google AI Studio. `imagen` / `stability` remain recognised-but-unimplemented (fail loud — no silent fallback). Orchestrator wires it after text generation with failure isolation — text drafts still ship if image generation throws. Per-draft `generation_context_json.image_generation` block carries `provider` / `model` / `status` / `artifact_url` (data URI for Gemini, null for stub) / `provider_asset_id` / `width` / `height` / `background_image_prompt` / `negative_prompt` / `error_code` / `error_message` / timestamps / `render_version`. **`Post.image_url` is intentionally untouched** — reserved for the final composited asset the overlay renderer will produce. Full prod auth + billing-verification procedure documented in [docs/08-deployment.md](docs/08-deployment.md) "Image generation provider — Gemini / Nano Banana 2".
5. ~~Brand-aware generation (voice / CTA style / language style / design notes / sample captions)~~ — **Done 2026-04-22.** Brand Management is the base AI profile; Event brief overrides on event-derived generation; Templates & Assets act as a supporting reference library (never a rule source). Precedence: Brand base → Event override → Templates reference. Real Anthropic Claude provider wired behind the boundary; `AI_PROVIDER=stub` default.
6. ⏳ **Operator sample comparison / selection support** — partial. `sample_group_id` + `sample_index`/`sample_total` are persisted; Queue rows show a "Sample N/M" chip and shared left-edge accent color for sibling recognition. A dedicated side-by-side comparison/selection UI hasn't been built yet.
7. ✅ **Preserve edit/reject/approval metadata for future learning** — the data path is preserved: `generation_context_json` carries per-draft AI metadata + frozen source snapshot + `templates_injected` counts + `ai_provider` + `ai_dry_run` + `prompt_version`; edit/reject/approve/schedule/retry transitions all flow through `audit_logs` with before/after snapshots. Phase 6 consumes this; the signals are captured today.

Definition of done:
- source facts can produce AI draft samples into Content Queue ✅
- drafts are brand-aware and source-aware ✅
- refine flow respects locked business rules ✅
- operators can compare and choose between samples ⏳ (data + sibling chip present; dedicated selection UI pending)

---

## PHASE 5 — AUTOMATE CONTENT CREATION FLOWS

Goal:
Use source rules + AI generation to create drafts automatically at the right
times.

Includes:
1. Big Wins automation generation flow
2. Running Promotions automation generation flow
3. Hot Games automation generation flow
4. Adhoc Event generation flow
5. Educational cadence generation flow
6. Group/sample generation handling
7. Generation health and observability

Definition of done:
- automations create drafts reliably into Content Queue
- no direct publishing from generation layer
- operators can review all generated outputs before publish

---

## PHASE 6 — CLOSE THE LEARNING LOOP

Goal:
Turn operator choices + content performance into future generation
improvements.

Learning signals to preserve:
- approved drafts
- edited drafts
- rejected drafts
- selected sample from a group
- top posts by clicks
- top posts by deposits
- top posts by GGR

Includes:
1. Preserve structured learning events
2. Define performance-learning feedback model
3. Surface useful insights for content optimization
4. Feed learnings back into prompt/context builder later

Definition of done:
- the system can eventually learn what operators prefer
- the system can eventually learn what actually performs

---

## PHASE 7 — SECONDARY PRODUCT HARDENING

Goal:
Finish supporting modules after the core content/publish engine is stable.

Includes:
1. Users & Roles polish
2. Audit Logs polish
3. Channels polish
4. Templates & Assets improvements
5. Insights expansion
6. Edge-case operational safeguards
7. Better error handling / recovery tooling

Definition of done:
- all admin/support modules are strong enough for team use at scale

---

## EXECUTION PRIORITY

Current practical priority order (updated 2026-04-27):
1. ✅ Phase 2 Manus publishing lifecycle — original 10 items resolved; ongoing bridge-hardening landing as needed.
2. 🟡 Phase 3 BigQuery/API source layer — 5 of 8 done; items 4 & 5 blocked on platform team `shared.game_rounds` provisioning.
3. 🟡 Phase 4 AI content generator agent — visual chain shipped end-to-end on 2026-04-27 (Brand Simple Mode UI, Event Visual Override UI + persistence, `compileVisualPrompt()` wired into `runGeneration()`, background-image provider boundary, Nano Banana 2 / Gemini real adapter, deterministic Satori + Resvg overlay renderer). Operational gates remain: Anthropic credits (text gen) + Gemini paid-tier upgrade (image gen) — both currently fall back to safe stubs in prod. Remaining product gaps: GCS-backed `artifact_url` migration (which then unblocks auto-population of `Post.image_url` from the composite), image inspector UI in Content Queue, dedicated sample-comparison UI.
4. **Phase 5 automate draft creation flows** — next major focus. Scheduler that calls `fetchPromotionsForBrand()` / `fetchBigWinsForBrand()` / `fetchHotGamesForBrand()` on each brand's `automation_rules.config_json` cadence + routes the resulting facts through the AI pipeline.
5. Phase 6 close learning loop.
6. Phase 1 & 7 secondary audits/polish.

**Known unblockers needed** before resuming blocked Phase 3/4 items:
- Platform team provisions `shared.game_rounds` → unlocks Phase 3 #4/#5 + exercises Big Wins / Hot Games adapters against live data.
- Anthropic credits top-up → flip `AI_PROVIDER=anthropic`, re-test Generate Drafts with real model output.
- Gemini API key paid-tier upgrade → flip `AI_IMAGE_PROVIDER=gemini`, re-test image generation with real Nano Banana 2 output. Verified blocker on 2026-04-27 via `npm run gemini:smoke`: the key returns `429 RATE_LIMITED` with `free_tier_requests, limit: 0` for `gemini-3.1-flash-image-preview`. Project-level billing on `mktagent-493404` isn't sufficient on its own — the key itself must be opted into paid tier at https://aistudio.google.com/api-keys. Until then prod stays on `AI_IMAGE_PROVIDER=stub` (overlay renderer falls back to brand-color solid background).

---

## CORE PRODUCT RULES

Always preserve these rules:
- AI creates drafts only
- Content Queue handles human review
- Manus handles publishing
- Retry reuses the same approved payload
- Refine does not break source rules
- Big Wins + Hot Games use BigQuery
- Running Promotions uses separate API
- Docs + WORKLOG must stay aligned with architecture changes

---

## LONG-TERM ARCHITECTURE PRINCIPLES

These are **compatibility requirements, not current build phases.** Current
phase priorities (above) are unchanged. The point is to preserve direction
so today's choices don't foreclose tomorrow's destination.

### Principle 1 — Stay signal-source-agnostic (OMEGA compatibility)

mkt-agent is the **execution layer** for marketing actions, not the
intelligence layer. Future external systems will emit structured signals —
competitor activity, sentiment / risk, opportunity flags, recommended
campaign directions, urgency / target audience / target channel hints. The
canonical example is **OMEGA**, a separate competitive-intelligence platform
spec'd outside this repo (Python + SQLite + Claude API + Next.js, deployed
independently). mkt-agent must be able to ingest those signals and execute
marketing actions from them, without coupling to OMEGA's specific schema or
stack.

Compatibility implications:
- External signals plug in as additional source types via the existing
  `SourceFacts` / per-source-normalizer / `runGeneration()` seam — not as new
  code paths around it.
- Cross-system traffic follows the **Manus pattern**: HTTP/JSON,
  secret-gated, signed callbacks if bidirectional. No shared DB, no shared
  deploy, no SDK coupling. mkt-agent stays a modular monolith.
- "OMEGA" is the canonical example, not a named coupling. The principle
  covers any future external intelligence source on equal footing.

### Principle 2 — Stay market-adaptable

Current focus is the Philippine market (WildSpinz brand: Tagalog-first,
GCash, PAGCOR-licensed). Future expansion into Thailand, Vietnam, Japan,
Korea, and beyond will bring different audience styles, language norms,
compliance regimes, creative preferences, campaign strategies, and platform
behaviors. The architecture must absorb that variation without re-plumbing.

Compatibility implications:
- Market-specific assumptions (Tagalog, GCash, PAGCOR) belong on Brand
  Management today — that is correct. The rule is **do not promote them to
  global defaults**, and do not assume them in code paths that will run for
  a non-PH brand later.
- Future context layering may grow into:
  `Market profile → Brand Management → Source facts → Event override → Templates`.
  A Market profile would carry market-wide language/tone norms, compliance
  rules, platform behavior, and payment-rail conventions. **Not a near-term
  build.** Naming the direction here keeps Brand Management from quietly
  absorbing market-level concerns and becoming painful to untangle later.

### Out of scope

Both principles describe extensibility, not deliverables. No new phase, no
near-term OMEGA implementation work, no near-term Market-profile build.
Phase 3 (data sources), Phase 4 (AI generator + visual UI), and Phase 5
(automate draft creation) priorities above remain unchanged. See
docs/00-architecture.md "Long-term direction" for the architectural
elaboration.
