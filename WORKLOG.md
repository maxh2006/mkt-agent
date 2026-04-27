# WORKLOG.md

## Project Roadmap

See [ROADMAP.md](ROADMAP.md) for the structured master roadmap (phases,
definitions of done, execution priority, core product rules). Read it alongside
this file at the start of any session.

Current execution priority (per ROADMAP.md):
1. Finish Manus publishing lifecycle (Phase 2)
2. Finalize BigQuery/API source layer (Phase 3)
3. Build AI content generator agent (Phase 4)
4. Automate draft creation flows (Phase 5)
5. Close learning loop (Phase 6)
6. Continue secondary audits/polish (Phases 1 & 7)

## Ongoing Tasks

- **⏳ REMINDER — Top up Anthropic credits** (console.anthropic.com → Billing). Required to flip `AI_PROVIDER=anthropic` in prod for real text generation.
  - Blocks: real AI generation in prod (Anthropic returns `403 Request not allowed` until credits exist)
  - Current account plan: Evaluation access (free, zero credits)
  - Ballpark: $5 minimum top-up ≈ 150+ full Event generate-drafts runs at sonnet-4.6 rates
  - When done: say "credits added" to the session → resume Phase 4 validation
- **⏳ REMINDER — Upgrade Gemini API key to paid tier** (https://aistudio.google.com/api-keys → key settings → "Set up billing" / paid tier).
  - Blocks: real background-image generation in prod (Gemini returns `429 RATE_LIMITED` with body `Quota exceeded for metric: ...generate_content_free_tier_requests, limit: 0, model: gemini-3.1-flash-image` until the key is opted into paid tier).
  - Verified blocker on 2026-04-27 via `npm run gemini:smoke` against the local env. Key + project + Generative Language API are all set up correctly; only the key's tier is the gate. Image-generation models are paid-tier-only; project-level billing on `mktagent-493404` isn't sufficient on its own — the key itself must be opted in.
  - Current state: `AI_IMAGE_PROVIDER=stub` in prod. Stub returns placeholder result with `artifact_url: null`; overlay renderer falls back to brand-color solid background; text drafts ship cleanly.
  - When done: re-run `npm run gemini:smoke` locally → if `OK`, follow the prod flip procedure in `docs/08-deployment.md` "Image generation provider — Gemini / Nano Banana 2", then say "key on paid tier" to the session.









## Done Tasks

### 2026-04-27
- Task: Phase 4 — GCS-backed artifact storage for composited images
  - Status: Complete (storage boundary live; orchestrator wired; `Post.image_url` auto-populates from composites when GCS is configured; safe-fallback paths preserved when storage is unconfigured or upload fails). One-time bucket creation per `docs/08-deployment.md` is the operator gate; the runbook is in place.
  - Why: the deterministic overlay renderer was producing real composites, but they sat as `data:` URIs in `generation_context_json.composited_image.artifact_url`. Manus dispatch only accepts http(s) URLs (media-validation host-privacy/scheme check), so AI-generated creatives couldn't actually publish. This task is the missing bridge — composites now upload to a public-read GCS bucket, get a permanent `https://storage.googleapis.com/...` URL, and the URL flows into `Post.image_url`. Existing Manus media-validation + dispatch + retry paths activate naturally with no code change to those layers.
  - Files added:
    - `src/lib/storage/gcs.ts` — sole storage boundary. `uploadCompositedPng()` (deterministic object path, public-read URL, structured failure), `isStorageConfigured()` (env check; orchestrator skips when false), `StorageError` class, `classifyStorageError()` heuristic for SDK error messages → canonical `StorageErrorCode` taxonomy. ~140 lines.
    - `scripts/gcs-storage-smoke.ts` — round-trip smoke (uploads a 67-byte test PNG, fetches via plain https GET, asserts byte-identity). New `npm run gcs:smoke` script. Costs ~$0.0001 per run.
  - Files modified:
    - `package.json` — added `@google-cloud/storage ^7.19.0` (sibling of existing `@google-cloud/bigquery`). Added `gcs:smoke` npm script.
    - `src/lib/ai/render/types.ts` — `CompositedImageResult` extended with `png_bytes?` (memory-only, stripped before persist), `bucket?`, `object_path?`, `mime_type?`, `byte_length?`, `uploaded_at?`. `RenderErrorCode` taxonomy extended with the four `STORAGE_*` codes the orchestrator's upload step adds.
    - `src/lib/ai/render/index.ts` — `renderFinalImage()` now also returns `png_bytes: pngBytes` alongside the data URI. The data URI stays as the fallback metadata representation when storage isn't configured.
    - `src/lib/ai/generate.ts` — orchestrator now calls `uploadCompositedPng()` between render + queue insert. Failure isolation: render fails → no upload, status=error; render OK + `isStorageConfigured()` false → upload skipped (composite stays as `data:` URI fallback, `Post.image_url` stays null); render OK + upload throws → status flipped to error with `STORAGE_*` code + message; text drafts always ship. Strips `png_bytes` from the result before passing to the queue inserter (memory-only field). Run-complete log line gains `storage=<status>:<bytes>b`.
    - `src/lib/ai/queue-inserter.ts` — `composited_image` block extended with `bucket` / `object_path` / `mime_type` / `byte_length` / `uploaded_at` (null when upload skipped/failed). New `Post.image_url` auto-populate logic: set ONLY when `composited.status === "ok"` AND `artifact_url.startsWith("https://")`. Operators retain the manual-paste override path (set once at creation; subsequent edits are operator-driven).
    - `.env.production.example` — new `GCS_ARTIFACT_BUCKET=""` section with full doc-comment about safe-fallback semantics + pointer to `docs/08-deployment.md` setup runbook.
    - `docs/08-deployment.md` — new "GCS artifact bucket — one-time setup" section: locked product calls, gcloud bucket-creation commands (uniform-bucket-level-access + public-read + VM SA write), wire into `/opt/mkt-agent/.env`, `npm run gcs:smoke` verification, what the helper does + does NOT do, common errors + meanings table mapping `STORAGE_*` codes to causes.
    - `docs/00-architecture.md` — Visual input architecture "MVP storage decision" subsection split into two contracts: AI background stays as `data:` URI (debug metadata; never publishable per the brand rule); composited final image uploads to GCS with permanent https URL. Notes the failure-isolation behavior.
    - `docs/02-data-model.md` — `Post.image_url` field doc updated: now auto-populated by AI generation when GCS is configured + composite renders successfully; manual operator override path preserved.
    - `docs/07-ai-boundaries.md` — overlay renderer subsection updated with the GCS storage migration paragraph; deferred-list updated to remove "GCS-backed artifact_url" (now done) and add "lifecycle / cleanup of composite artifacts" as the new deferred item; renderer error-taxonomy line extended with the four `STORAGE_*` codes; persisted shape extended with the upload metadata fields.
    - `ROADMAP.md` — Phase 4 EXECUTION PRIORITY paragraph updated: GCS storage migration removed from "remaining product gaps"; remaining gaps are now image inspector UI + sample-comparison UI + composite cleanup/lifecycle. Known unblockers extended with the one-time GCS bucket setup as a third operational gate alongside Anthropic credits + Gemini paid-tier (until the user runs the gcloud commands + sets `GCS_ARTIFACT_BUCKET`, `Post.image_url` stays null).
    - `WORKLOG.md` — this entry; Ongoing entry removed.
  - Storage boundary contract:
    - **Auth**: ADC. Prod uses VM SA via metadata service; local dev uses `gcloud auth application-default login`. No JSON key files in code. Mirrors the `@google-cloud/bigquery` pattern at `src/lib/bq/client.ts`.
    - **Bucket access model**: public-read at the bucket level (uniform-bucket-level-access + `allUsers:objectViewer`). Permanent `https://storage.googleapis.com/<bucket>/<path>` URLs. Zero signing code. Matches the use case (these images go public on Meta/Telegram anyway).
    - **Object path**: `generated/<brand_id>/<sample_group_id>.png`. One composite per generation run; siblings share the URL since the composite content is identical.
    - **Cache headers**: `public, max-age=31536000, immutable`. Artifacts are content-addressed by `sample_group_id` (UUID); never re-written.
    - **What's uploaded**: ONLY the FINAL composited PNG. The AI background (`image_generation.artifact_url`) stays as a `data:` URI since it's debug metadata, not publishable. The brand rule "AI generates backgrounds; app composites text + logos" forbids ever shipping the background-only image as the final creative.
  - Auto-population of `Post.image_url` (the locked behavior table):

    | Scenario | `composited.status` | `composited.artifact_url` | `Post.image_url` |
    |---|---|---|---|
    | Render fails | `error` | `null` | `null` |
    | Render OK, `GCS_ARTIFACT_BUCKET` unset | `ok` | `data:image/png;base64,...` (fallback) | `null` |
    | Render OK, GCS upload throws | `error` (code: `STORAGE_*`) | `null` | `null` |
    | Render OK, GCS upload succeeds | `ok` | `https://storage.googleapis.com/<bucket>/<path>` | same https URL |

    `Post.image_url` is set ONLY when there's a real https URL. Text drafts always ship in every scenario.
  - Manus / media-validation compatibility: NO changes to `src/lib/manus/media-validation.ts`, `collectMediaUrls()`, `validateMediaUrls()`, dispatcher, or callback. The existing path works unchanged because `Post.image_url` now has a real https URL flowing through the same field. The retryability classifier and Manus protocol are untouched.
  - Verification:
    - `npx tsc --noEmit` clean (EXIT=0).
    - `npm run visual:smoke` clean (27/27; compiler unchanged).
    - `npm run render:smoke` clean (renderer still produces a 140KB 1080x1080 PNG; the new `png_bytes` field is populated).
    - `npm run gcs:smoke` — **NOT exercised this session.** Requires `GCS_ARTIFACT_BUCKET` set + bucket created. The operator runbook in `docs/08-deployment.md` is what unblocks this; until they run the gcloud commands, the safe-fallback path is what applies (composite stays as `data:` URI; `Post.image_url` stays null; everything still works).
    - End-to-end fixture / Manus dispatch verification — also pending the bucket creation.
  - What remains deferred (these are now the only Phase 4 gaps):
    - Image inspector UI in Content Queue showing composite preview + visual_compiled resolved direction.
    - Dedicated sample-comparison / selection UI for sibling drafts.
    - Composite artifact lifecycle / cleanup (rejected drafts' artifacts stay in GCS until a future cleanup job).
    - Per-sibling composite re-renders (still one composite per run; siblings share).
  - Per the durable cadence rule (every accomplished task → both ROADMAP and WORKLOG updated, every time, in one commit): ROADMAP EXECUTION PRIORITY + Known unblockers + 4 docs + WORKLOG + 7 source files (3 new, 4 modified) + smoke script + env example land in the same commit. No deploy needed today (zero runtime change in prod since `GCS_ARTIFACT_BUCKET` is unset there); deploy + bucket-creation can be sequenced together when the operator is ready.

### 2026-04-27
- Task: Phase 4 — Deterministic overlay renderer (Satori + Resvg)
  - Status: Complete (renderer wired, persisted, smoke-tested; closes Phase 4 sub-bullet 6)
  - Why: Phase 4 visual chain was input-side complete and provider-side complete (Nano Banana 2 wired earlier today), but no step was actually composing the final image. Operators couldn't see what the post would look like once published. This task is the composite step: Post text + brand logo overlaid on the AI background using the layout spec's text zones / safe zones / logo slot.
  - Files added (new `src/lib/ai/render/` module):
    - `types.ts` — `RenderRequest`, `CompositedImageResult`, `RenderErrorCode` taxonomy (`MISSING_INPUTS` / `BACKGROUND_DECODE_FAILED` / `FONT_LOAD_FAILED` / `SATORI_FAILED` / `RESVG_FAILED` / `UNKNOWN`), `RENDER_VERSION` (`v1-2026-04-27`), `buildRenderErrorResult()` helper.
    - `fonts.ts` — module-level cached loader for the bundled Open Sans Regular + Bold TTFs from `public/fonts/`. Lazy promise, single read per process. Throws on missing files (caller classifies as `FONT_LOAD_FAILED`).
    - `decode-bg.ts` — `decodeBackground()` parses `data:` URI → `{mime, bytes, data_uri}`. Returns null for empty / non-data inputs (renderer falls back to brand-color background). Throws on malformed data URIs.
    - `fetch-logo.ts` — `fetchLogoBytes()` for brand logos. Reuses the existing `isPrivateHost()` guard from `src/lib/manus/media-validation.ts` to block SSRF on operator-set logo URLs. 5s timeout, 2MB cap, image-only Content-Type check. Returns null on any failure (logo silently skipped — never fatal).
    - `compose.tsx` — pure JSX template Satori consumes. Reads layout text_zones (percentage rectangles → pixel coordinates per platform-format canvas), places `headline / caption / cta / banner` per slot with emphasis-driven font sizes (5.5% / 3.2% / 2.2% of canvas's smaller dimension for prominent / supporting / subtle), gradient overlay div for legibility behind text (top/bottom/left/right direction + extent + intensity), brand logo at `logo_slot` rect when bytes are available, white text with soft shadow for cross-background readability.
    - `index.ts` — `renderFinalImage()` entry. Orchestrates: resolve layout → decode background (or fall back to brand color) → fetch logo (silent skip on failure) → load fonts → Satori → Resvg → data URI. Always returns a result; structured errors flow through `status: "error"` with `error_code` populated.
    - `scripts/render-smoke.ts` — synthetic render test; writes `/tmp/render-smoke.png` and exits 0. New `npm run render:smoke` script. Confirms the pipeline works without depending on DB / AI providers.
    - `public/fonts/OpenSans-Regular.ttf` + `OpenSans-Bold.ttf` — committed TTF files (~150KB each, OFL-licensed).
  - Files modified:
    - `package.json` — added `satori ^0.26.0` + `@resvg/resvg-js ^2.6.2` deps. Added `render:smoke` npm script.
    - `src/lib/ai/types.ts` — extended `NormalizedGenerationInput` with optional `composited?: CompositedImageResult` (orchestrator → inserter handoff).
    - `src/lib/ai/generate.ts` — orchestrator now constructs a `RenderRequest` from `args.input.brand` (with `extractBrandLogos()` helper that reads `design_settings_json.logos`), the compiled visual prompt, the image_result's artifact_url, and the FIRST sample's text fields. Calls `renderFinalImage()` AFTER background-image generation with a try/catch wrapper (renderer also handles errors internally; the wrapper is belt-and-braces for unexpected throws like Resvg native binding crashes). Result is attached as `inputWithComposite.composited` and threaded into queue insertion. Run-complete log line now ends with `composite=<status>[/fallback]`.
    - `src/lib/ai/queue-inserter.ts` — writes `generation_context_json.composited_image` per draft when `input.composited` is present. Block fields: `status`, `artifact_url` (data URI), `width`, `height`, `layout_key`, `platform_format`, `visual_emphasis`, `background_fallback`, `logo_drawn`, `error_code`, `error_message`, `generated_at`, `duration_ms`, `render_version`. **`Post.image_url` deliberately not touched** — same MVP discipline as the image provider task.
    - Docs: `docs/00-architecture.md` (new "Deterministic overlay renderer" subsection with full inputs / outputs / error taxonomy / smoke pointer), `docs/07-ai-boundaries.md` (renderer-shipped paragraph; updated deferred list to lift "overlay renderer is the next missing piece" → call out GCS storage as the next gate), `docs/03-ui-pages.md` (Brand Design + Event Visual Override "Active in generation" notes mention the composite is now persisted alongside the AI background).
    - `ROADMAP.md` — Phase 4 sub-bullet 6 flipped ⏳ → ✅. Cross-references the GCS storage follow-up as the gate that finally auto-populates `Post.image_url`.
    - `WORKLOG.md` — this entry; Ongoing entry removed.
  - Toolchain choice (locked):
    - **Satori + @resvg/resvg-js** — pure JS for Satori, native binding for Resvg. No headless browser (no Puppeteer / Playwright), no Cairo dep (not node-canvas), no canvaskit-wasm. Both packages install cleanly on the VM via npm.
    - Bundled fonts: Open Sans Regular + Bold (OFL-licensed, fetched once from googlefonts/opensans GitHub repo, committed under `public/fonts/`). Multi-script support (Tagalog / Vietnamese / Japanese / Korean — for the OMEGA SEA expansion future) lands when those markets do; the `fonts.ts` array structure makes adding Noto family TTFs trivial. (Note: didn't bundle Inter because the upstream repo only ships woff2; Open Sans is functionally equivalent for our Latin-script needs and matches the same MVP profile.)
  - Locked product calls (per the approved plan):
    1. One composite per run, replicated across siblings (text deltas between siblings are minor; per-sibling renders aren't worth the cost in MVP).
    2. AI background can be missing → solid brand-color fallback using `secondary_color → primary_color → accent_color → #1f2937`. Operators get a usable preview marked `background_fallback: true`.
    3. Brand logo can be missing → silently skipped. Not an error.
    4. **`Post.image_url` STILL intentionally untouched.** Manus dispatch only accepts http(s) URLs; data URIs would block all dispatches. The GCS storage migration follow-up is what unlocks auto-population.
    5. No new env vars; renderer is pure code, always on.
    6. Stub-mode AI generation continues to produce composites — they just sit on a brand-color fallback (no real AI artwork).
  - Where artifact output is stored:
    - `Post.generation_context_json.composited_image.artifact_url` — `data:image/png;base64,…` URI of the composited PNG. Same MVP storage pattern as the Gemini adapter; same GCS migration unblocks both. `Post.image_url` is NOT touched.
  - Failure handling:
    - Renderer never throws on operational errors — always returns `CompositedImageResult` with `status: "error"` + structured `error_code` + `error_message`.
    - Orchestrator wraps the call in try/catch as belt-and-braces against unexpected throws (Resvg native binding crashes, OOM, etc.). Worst case → `error_code: "UNKNOWN"` persisted into composited_image.
    - Background decode error → renderer fails (vs falling back); operator can re-trigger generation. Could be relaxed to fall-back-to-brand-color in a future iteration.
    - Logo fetch failure (network, SSRF guard, oversize) → silent skip; composite renders without a logo.
    - Font load failure → `FONT_LOAD_FAILED` (deploy-config error; should never happen in prod since fonts are committed).
    - Text drafts ALWAYS ship — image failure never blocks the run.
  - Verification:
    - `npx tsc --noEmit` clean (EXIT=0).
    - `npm run visual:smoke` clean (27/27 — compiler unchanged).
    - `npm run render:smoke` produced a 140KB 1080x1080 PNG at `/tmp/render-smoke.png` in ~1.1s (brand-color fallback path; no AI background; no logo). Pipeline confirmed working.
    - **Not yet exercised against a real Gemini-produced background or a real brand logo** — terminal-only session. Recommended manual smoke after deploy: trigger any generation through `POST /api/ai/generate-from-fixture` (with `ALLOW_AI_FIXTURES=true`) and inspect the resulting `Post.generation_context_json.composited_image` block.
  - What remains deferred:
    - **GCS-backed `artifact_url` migration** — the next missing piece. Replaces both `image_generation.artifact_url` and `composited_image.artifact_url` data URIs with hosted https URLs. AT THAT POINT auto-population of `Post.image_url` from the composite becomes possible (Manus dispatch will accept the URL).
    - Image inspector UI in Content Queue showing the composite preview + visual_compiled resolved direction.
    - Per-sibling composites (currently one render per run; siblings share). If operator feedback wants sample-specific composites, that's a small change.
    - Multi-script font support beyond Latin (Noto Sans family for Tagalog / Vietnamese / Japanese / Korean — when SEA expansion lands per the OMEGA roadmap).
    - Dynamic font sizing / autofit (currently fixed sizes per emphasis level scaled to canvas dimensions).
    - Drop shadows / blur / vignette effects beyond solid + gradient overlay.
    - Refine modal showing the composite + per-sample re-render UX.
  - Per the durable commit-batching rule: ROADMAP + 3 docs + WORKLOG + package.json + 6 source files (5 new + 1 modified) + 2 font files + 1 smoke script land in the same commit.

### 2026-04-27
- Task: Phase 4 — Nano Banana 2 / Gemini real image-provider adapter
  - Status: Complete (first real background-image provider shipped behind the existing boundary; stub stays default; prod flip procedure + auth path fully documented BEFORE any prod activation)
  - Why: visual compiler emits a complete `background_image_prompt` + `negative_prompt` per generation but the stub-only image boundary couldn't actually produce an image. This task ships the first real provider so we can move toward real backgrounds, while keeping the safe stub default + same failure isolation.
  - Files added:
    - `src/lib/ai/image/gemini.ts` — Gemini API adapter via raw `fetch` (no SDK dep). Auth via `GEMINI_API_KEY` header; default model `gemini-3.1-flash-image-preview` (Nano Banana 2 product name) overridable via `AI_IMAGE_MODEL`. Composes the prompt by passing the compiler's positive prompt verbatim, appending the negative prompt as an explicit "Avoid:…" instruction, and adding a platform-format hint at the end. Encodes inline base64 response bytes as a `data:image/png;base64,…` URI in `artifact_url`. Maps HTTP status / network failures / safety-blocked responses onto the canonical `ImageProviderErrorCode` taxonomy (`INVALID_PROMPT` / `POLICY_REJECTED` / `AUTH_ERROR` / `RATE_LIMITED` / `TEMPORARY_UPSTREAM` / `NETWORK_ERROR` / `UNKNOWN`). 60s timeout; AbortController on the fetch. One observability log line on success and on failure. Module-header comment includes the auth-path runbook so a future agent can't miss the Anthropic-style billing trap.
  - Files modified:
    - `src/lib/ai/image/client.ts` — `case "gemini":` now dispatches to `geminiProvider()` (replaces the previous fail-loud throw). `imagen` / `stability` remain throw-stubs. Unknown values still fail loud.
    - `.env.production.example` — added `GEMINI_API_KEY=""` with a billing-requirement callout and a pointer to `docs/08-deployment.md`. Updated the `AI_IMAGE_PROVIDER` and `AI_IMAGE_MODEL` doc-comments to reflect that `gemini` is now wired and to spell out the default model id.
    - `docs/08-deployment.md` — new section "Image generation provider — Gemini / Nano Banana 2": auth path (API key only, no Vertex AI for now), where to get the key (Google AI Studio at https://aistudio.google.com/apikey), billing requirement (linked GCP project must have billing enabled + "Generative Language API" enabled — otherwise 403 PERMISSION_DENIED / 429 RESOURCE_EXHAUSTED), prod flip procedure (`sed` + `pm2 restart --update-env` mirroring the AI_PROVIDER=anthropic flip), verification curl against the lowest-privilege list-models endpoint, common errors + meanings table mapping HTTP statuses to the canonical adapter `error_code`. Explicit Anthropic-failure-mode parallel called out so the operator knows what to verify BEFORE flipping in prod.
    - `docs/00-architecture.md` — Visual input architecture "Background-image provider boundary" subsection extended with the Gemini adapter row + the locked MVP storage decision (data URI in `artifact_url`; GCS migration is a follow-up; the field name is stable).
    - `docs/07-ai-boundaries.md` — Background-image provider boundary subsection updated to list Gemini as the first real adapter alongside the existing stub. Deferred-list updated: deterministic overlay renderer is now the next missing piece.
    - `docs/03-ui-pages.md` — Brand Design + Event Visual Override "Active in generation" notes updated to mention the real provider is wired and ready to activate per docs/08.
    - `ROADMAP.md` — Phase 4 sub-bullet 7 flipped 🟡 → ✅ (boundary + first real adapter shipped). Cross-references docs/08 for the prod auth path.
    - `WORKLOG.md` — this entry; Ongoing entry removed; new reminder added to provision Gemini key + verify billing before flipping in prod.
  - Provider/env contract:
    - `AI_IMAGE_PROVIDER=stub` (default; safe-prod fallback). Returns placeholder result with `artifact_url: null`. Zero cost.
    - `AI_IMAGE_PROVIDER=gemini` → `geminiProvider()`. Default model `gemini-3.1-flash-image-preview`; override via `AI_IMAGE_MODEL`. Requires `GEMINI_API_KEY`; fails loud on absence (no silent fallback to stub).
    - `AI_IMAGE_PROVIDER=imagen|stability` → recognised but unimplemented; throw fail-loud (unchanged).
    - Unknown value → throw fail-loud (unchanged).
  - How the Gemini adapter was implemented:
    - **Auth**: `x-goog-api-key: ${GEMINI_API_KEY}` header (kept out of access logs vs query-param). API-key-only; we deliberately did NOT wire Vertex AI / ADC for image generation — too much GCP setup for a model served identically from the simpler Gemini API endpoint. The auth path is identical to other Anthropic-style API providers in this codebase.
    - **Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`.
    - **Body**: `{contents: [{role:"user", parts:[{text}]}], generationConfig:{responseModalities:["IMAGE"]}}`. Image-only response (no text rationale we'd discard).
    - **Prompt composition**: visual compiler's positive prompt (already includes safe-zone instruction + "no text in image" rule + brand/event notes) + explicit "Avoid:…" instruction sourced from the compiled negative_prompt + a platform-format hint at the end.
    - **Aspect ratio mapping**: encoded in the prompt text via the format hint (square 1:1 / portrait 4:5 / landscape 16:9 / story 9:16). Gemini doesn't have a stable aspect-ratio body parameter across all image-capable models, so prompt-based steering is the durable approach for now.
    - **Response parsing**: walk `candidates[].content.parts[]` for the first `inlineData` part; extract `mimeType` + `data`. If absent and `promptFeedback.blockReason` is set → `POLICY_REJECTED` error result.
    - **No SDK dependency added**: raw fetch keeps the dependency tree lean and the contract explicit. ~250 lines including types, error mapping, prompt composition, response parsing.
  - Where artifact output is stored:
    - **Inline `data:image/png;base64,…` URI** in `Post.generation_context_json.image_generation.artifact_url`. This is the smallest clean MVP persistence path — no bucket, no Nginx alias, no filesystem permissions to manage. Works end-to-end through the existing `image_generation` block schema. The future overlay renderer can decode the data URI directly via `Buffer.from(base64, "base64")`.
    - DB cost: ~100KB-1MB per draft per generation run inside `generation_context_json`. Acceptable while volume is low (Anthropic credits aren't even paid up). The migration path to GCS-backed `https://…` URLs is a follow-up — the schema field is stable; only the URL scheme changes.
    - **Crucially: `Post.image_url` is NOT touched.** That field remains reserved for the FINAL composited image the deferred overlay renderer will produce. Background-only artifacts MUST NEVER be auto-shipped to Manus as the final creative — Manus media-validation runs only against `Post.image_url`.
  - Failure handling (preserves the existing isolation contract):
    - Any throw from the adapter (e.g. `GEMINI_API_KEY` missing) is caught by the orchestrator's try/catch in `src/lib/ai/generate.ts` and normalized via `buildImageErrorResult()` to a `status: "error"` result with `error_code: "NOT_CONFIGURED"` (or `"UNKNOWN"`). Text drafts still ship.
    - Adapter-level failures (4xx / 5xx / timeout / network / content-policy block) DON'T throw — they return a `status: "error"` result directly with the precise `error_code` from the canonical taxonomy. Cleaner than throwing for every transient hiccup.
    - All failure paths persist `error_code` + `error_message` into `image_generation` per draft so operators / future code can grep and triage.
  - What remains deferred for the overlay-renderer step:
    - **Deterministic overlay renderer** (Satori + sharp or similar) — the next missing piece. Composites `Post.headline/caption/cta/banner_text` + brand logos onto the AI background using `safe_zone_config` from `visual_compiled`. Output of THAT step is what populates `Post.image_url` (the final publishable image).
    - GCS-backed `artifact_url` (data URIs work for MVP; bucket migration is the durability/cost move).
    - Additional real adapters (Imagen / Stability — Gemini is the first, contract is locked; each new adapter ≈ this one's shape).
    - Image inspector UI in Content Queue.
    - Automatic Manus publishing of the final composited image.
  - Verification:
    - `npx tsc --noEmit` clean (EXIT=0).
    - `npm run visual:smoke` clean (27/27 assertions across 6 cases) — confirms the visual compiler is unchanged and the new adapter doesn't disturb existing test paths.
    - **Adapter NOT exercised against a real Gemini key this session** — terminal-only, no key provisioned yet. Code paths are typecheck-clean; the prod activation procedure is documented in `docs/08-deployment.md`. Recommended first prod smoke: provision the key per the docs, flip AI_IMAGE_PROVIDER=gemini, run a single Event "Generate Drafts", inspect `Post.generation_context_json.image_generation` — expect `provider="gemini"`, `status="ok"`, `artifact_url` starting with `data:image/png;base64,`.
  - Per the durable commit-batching rule: ROADMAP + 4 docs (00, 03, 07, 08) + env example + WORKLOG + 2 source files (1 new, 1 modified) land in the same commit.

### 2026-04-27
- Task: Phase 4 — Background-image provider adapter (boundary + stub)
  - Status: Complete (provider boundary live; stub-only initial landing; real adapter implementation lands in a follow-up)
  - Why: visual compiler is wired into `runGeneration()` and emits a fully-formed `background_image_prompt` + `negative_prompt` per generation, but no provider was actually consuming them. This task adds the provider boundary so a real image model (Gemini / Imagen / Stability / etc.) can slot in without re-plumbing the pipeline. Mirrors the text-provider boundary at `src/lib/ai/client.ts`.
  - Files added:
    - `src/lib/ai/image/types.ts` — provider contract: `BackgroundImageRequest`, `BackgroundImageResult`, `ImageProvider` (`stub|gemini|imagen|stability`), `ImageGenerationStatus` (`ok|skipped|error`), canonical `ImageProviderErrorCode` taxonomy (`NOT_CONFIGURED|AUTH_ERROR|RATE_LIMITED|INVALID_PROMPT|POLICY_REJECTED|TEMPORARY_UPSTREAM|NETWORK_ERROR|UNKNOWN`), `RENDER_VERSION` (`v1-2026-04-27`), `buildImageErrorResult()` helper.
    - `src/lib/ai/image/client.ts` — `generateBackgroundImage()` provider switch + deterministic stub. Stub returns `status: "ok"` with `artifact_url: null` (zero cost, prod-safe). Real provider names (`gemini`, `imagen`, `stability`) are recognised values that throw fail-loud until adapters are implemented — no silent fallback to stub on misconfig (matches `AI_PROVIDER=anthropic` pattern).
  - Files modified:
    - `src/lib/ai/types.ts` — added optional `image_result?: BackgroundImageResult` to `NormalizedGenerationInput` for orchestrator → inserter handoff.
    - `src/lib/ai/generate.ts` — orchestrator now constructs a `BackgroundImageRequest` from the compiled visual prompt + brand palette + trace fields, calls `generateBackgroundImage()` AFTER text generation (so text drafts ship even if image generation flakes), wraps the call in try/catch, normalizes throws via `buildImageErrorResult()` with code derivation from message (`NOT_CONFIGURED` for env errors, `UNKNOWN` otherwise). Shared image result attached as `inputWithImage.image_result` and threaded into queue insertion. Run-complete log line gains `image=<provider>:<status>`.
    - `src/lib/ai/queue-inserter.ts` — writes `generation_context_json.image_generation` block per sibling draft when `input.image_result` present. Block fields: `provider`, `model`, `status`, `artifact_url`, `provider_asset_id`, `width`, `height`, `background_image_prompt`, `negative_prompt`, `skipped_reason`, `error_code`, `error_message`, `generated_at`, `duration_ms`, `render_version`. **`Post.image_url` deliberately not touched** — reserved for the final composited asset.
    - `.env.production.example` — added `AI_IMAGE_PROVIDER="stub"` (default) + `AI_IMAGE_MODEL=""` with a callout that `Post.image_url` stays reserved for the final composite.
    - `docs/00-architecture.md` — new "Background-image provider boundary" paragraph in the Visual input architecture subsection; queue-inserter persisted-block list extended.
    - `docs/07-ai-boundaries.md` — full subsection on the boundary (inputs / outputs / error taxonomy / orchestrator integration / persistence / what's deferred).
    - `docs/03-ui-pages.md` — Brand Design + Event Visual Override sections gain a note that every draft now carries an `image_generation` block alongside `visual_compiled`.
    - `ROADMAP.md` — Phase 4 sub-bullet 7 (image-rendering provider adapter) flipped from ⏳ deferred → 🟡 boundary shipped (stub-only); sub-bullet 6 (overlay renderer) updated to note the input contract is now complete.
    - `WORKLOG.md` — this entry.
  - Provider/env contract:
    - `AI_IMAGE_PROVIDER=stub` (default, safe prod, zero cost, deterministic placeholder result).
    - `AI_IMAGE_PROVIDER=gemini|imagen|stability` — recognised but unimplemented. Selecting one throws "adapter is not implemented yet" — operator must implement or revert to stub.
    - Unknown provider value → throws "Unknown AI_IMAGE_PROVIDER" with valid values listed.
    - `AI_IMAGE_MODEL` — provider-specific; documented per adapter when shipped.
  - Orchestrator integration point:
    - In `runGeneration()`, after `generateSamples()` (text) and before `insertSamplesAsDrafts()` (queue insert). One image request per run (compiled visual prompt is identical for siblings); the result is replicated to every sibling draft via the queue inserter. Failure isolation via try/catch — text drafts always ship.
  - Persisted shape (per-draft `generation_context_json.image_generation`):
    - `provider`, `model`, `status`, `artifact_url`, `provider_asset_id`, `width`, `height`, `background_image_prompt`, `negative_prompt`, `skipped_reason`, `error_code`, `error_message`, `generated_at`, `duration_ms`, `render_version`. Sufficient for the future overlay renderer to fetch (when `artifact_url` is non-null) and for operator debugging.
  - `Post.image_url`: **intentionally left untouched.** That field stays reserved for the FINAL composited image the deterministic overlay renderer (still deferred) will produce. Background-only artifacts are never auto-shipped to Manus as the final creative — Manus media-validation only runs against `Post.image_url`. This is the explicit product call from the task brief: "generated background artifact is stored as an intermediate asset; final publishable image remains a later overlay/composite concern."
  - Failure behavior:
    - Provider throws → caught by orchestrator → normalized to `BackgroundImageResult { status: "error", error_code, error_message, ... }` → persisted in `image_generation` block → run continues to insert text drafts.
    - Provider returns `status: "skipped"` (e.g. dry-run flag) → persisted with `skipped_reason` populated → run continues.
    - Stub provider always returns `status: "ok"` with `artifact_url: null` (placeholder).
    - Real-provider misconfig (e.g. `AI_IMAGE_PROVIDER=gemini` with no API key) → fail-loud throw → orchestrator persists `NOT_CONFIGURED` error result + emits a warning log line. Operator sees the misconfig immediately rather than silently falling back to stub.
  - What remains deferred for the overlay-renderer step:
    - Real image-model adapter implementation (Gemini / Nano Banana 2 / Imagen / Stability). Contract is locked; implementation = ~50-100 lines per adapter following the stub's shape.
    - Asset hosting / S3 / CDN pipeline for storing real artifacts when the provider returns binary or signed URLs. Stub returns null artifact_url so this isn't blocking yet.
    - Deterministic overlay renderer (Satori + sharp or similar) — composites Post.headline/caption/cta/banner_text + brand logos onto the AI background using `safe_zone_config`. The output of THAT step is what populates `Post.image_url`.
    - Image inspector UI in Content Queue (preview the persisted `image_generation` artifact + `visual_compiled` resolved direction).
    - Automatic Manus publishing path with the final composited image.
  - Roadmap/doc updates:
    - ROADMAP Phase 4 sub-bullet 7 status flipped, sub-bullet 6 cross-referenced.
    - 4 docs updated (00, 03, 07, plus env example).
    - WORKLOG entry written.
  - Verification:
    - `npx tsc --noEmit` clean (EXIT=0).
    - `npm run visual:smoke` clean (27/27 assertions across 6 cases) — confirms the visual compiler itself is unchanged.
    - **End-to-end NOT exercised in a browser this session** — terminal-only. After deploy, recommended smoke: trigger any generation (Event "Generate Drafts" or `POST /api/ai/generate-from-fixture`); inspect the resulting `Post.generation_context_json.image_generation` — expect `{ provider: "stub", status: "ok", artifact_url: null, render_version: "v1-2026-04-27", ... }` and the orchestrator log line should include `image=stub:ok`.
  - Per the durable commit-batching rule: ROADMAP + 3 docs + env example + WORKLOG + 5 source files (2 new, 3 modified) land in the same commit.

### 2026-04-27
- Task: Phase 4 — Wire compileVisualPrompt() into runGeneration() (activation)
  - Status: Complete (compiler now active in live AI generation pipeline; no Prisma migration; backward-compatible additive change)
  - Why: Phase 4 visual input system shipped end-to-end on the operator side earlier today (Brand Simple Mode UI + Event Visual Override UI), but `runGeneration()` was never calling the compiler. Saved Brand + Event visual settings sat in JSON columns unread; the AI's narrative `image_prompt` field was drafted with no awareness of the operator's structured choices. This task is the activation step.
  - Files modified:
    - `src/lib/ai/visual/validation.ts` — added `coerceBrandVisualDefaults()` tolerant reader (mirrors the existing `coerceEventVisualOverride()` shape; falls back per-field to `DEFAULT_BRAND_VISUAL_DEFAULTS` for legacy brands).
    - `src/lib/ai/types.ts` — extended `BrandContext` with required `visual_defaults: BrandVisualDefaultsInput` (loader always fills it). Extended `EventOverride` with `visual_settings: EventVisualOverrideInput | null` (null when event has no override block). Extended `NormalizedGenerationInput` with optional `visual?: CompiledVisualPrompt` (orchestrator populates before `buildPrompt`; off-pipeline call sites leave it undefined and the inserter skips the persistence block).
    - `src/lib/ai/load-brand.ts` — uses `coerceBrandVisualDefaults(extractVisualDefaultsRaw(b.design_settings_json))` to lift the saved block into `BrandContext.visual_defaults`. Tiny `extractVisualDefaultsRaw()` helper isolates the JSON-shape extraction.
    - `src/app/api/events/[id]/generate-drafts/route.ts` — calls `coerceEventVisualOverride(event.visual_settings_json)` once per run; sets `EventOverride.visual_settings` to the resulting block or `null` (when empty).
    - `src/lib/ai/generate.ts` — orchestrator now calls `compileVisualPrompt({brand: input.brand.visual_defaults, event: input.event?.visual_settings ?? null, platform, source_facts})` after templates load and before `buildPrompt`. Result is attached as `inputWithVisual.visual` and threaded through prompt build, provider call, and queue insert. Log line gains `layout=… emphasis=… format=… overrides=[…]` for observability.
    - `src/lib/ai/prompt-builder.ts` — new `visualDirectionSection()` between `platformSection()` and `sourceFactsSection()`. Surfaces `subject_focus`, `visual_emphasis`, `layout_key`, `platform_format`, `overridden_by_event` audit, and the top ~6 compiled negatives. The `image_prompt` field description in `outputSchema()` updated to instruct alignment with the structured cues. `PROMPT_VERSION` bumped `v2-2026-04-22` → `v3-2026-04-27` with a doc-comment changelog.
    - `src/lib/ai/queue-inserter.ts` — writes `generation_context_json.visual_compiled` block per draft when `input.visual` is present: `layout_key`, `safe_zone_config`, `render_intent`, `platform_format`, `visual_emphasis`, `subject_focus`, `effective_inputs` (incl. `overridden_by_event`), `background_image_prompt`, `negative_prompt`. `promptVersionFromEnv()` fallback bumped to `v3-2026-04-27` to match the prompt builder.
    - Docs: `docs/00-architecture.md` (Visual input architecture Product rule extended with the activation paragraph), `docs/07-ai-boundaries.md` (new "Compiler wired into live generation" paragraph alongside the Brand/Event persistence notes), `docs/03-ui-pages.md` (Brand Design tab + Event Visual Override section gain "Active in generation" notes), `ROADMAP.md` (Phase 4 sub-bullet 4 status note: compiler now wired into `runGeneration()`).
    - `WORKLOG.md` — this entry; Ongoing entry removed.
  - Compiler input wiring:
    - Brand: `Brand.design_settings_json.visual_defaults` → `BrandContext.visual_defaults` (filled with canonical defaults if missing).
    - Event: `Event.visual_settings_json` → `EventOverride.visual_settings` (null when event has no overrides; partial when some are set).
    - Platform + source facts: already in `NormalizedGenerationInput` from each per-source normalizer.
  - Compiler outputs now used downstream:
    - **Prompt builder** consumes `subject_focus`, `visual_emphasis`, `layout_key`, `platform_format`, top of `negative_prompt`, and `effective_inputs.overridden_by_event` — keeps the AI's narrative `image_prompt` aligned with the structured direction.
    - **Queue inserter** persists the full compiled artifact set under `generation_context_json.visual_compiled` for the future image-rendering provider + overlay renderer.
  - Generation metadata added per draft:
    - `visual_compiled.layout_key` — which canonical layout the renderer will use
    - `visual_compiled.safe_zone_config` — `{ zones, gradient_overlay? }` for the overlay renderer
    - `visual_compiled.render_intent` — locked `"ai_background_then_overlay"` (forward compat for future render intents)
    - `visual_compiled.platform_format` — resolved square / portrait / landscape / story
    - `visual_compiled.visual_emphasis` + `visual_compiled.subject_focus` — operator-resolved focal direction
    - `visual_compiled.effective_inputs` — `{visual_style, visual_emphasis, main_subject_type, layout_family, overridden_by_event[]}` — audit trail
    - `visual_compiled.background_image_prompt` + `visual_compiled.negative_prompt` — ready for the image model
  - Backward compatibility:
    - Legacy brands without `design_settings_json.visual_defaults` → `coerceBrandVisualDefaults()` returns canonical defaults; pipeline runs identically to before on the surface.
    - Events without `visual_settings_json` → `EventOverride.visual_settings = null` → compiler treats as "no override" → uses pure brand visuals.
    - Non-event source types (`big_win`, `promo`, `hot_games`, `educational`) → `input.event = null` → compiler uses pure brand visuals.
    - Stub provider unchanged; Anthropic provider unchanged in shape (just sees one extra prompt section + an updated `image_prompt` field description).
    - Refine modal unchanged (doesn't read `visual_compiled` today; can adopt later as a small follow-up).
    - The narrative `image_prompt` text field on `Post` is still AI-emitted and operator-readable as before.
  - Out of scope (deliberately):
    - No image-rendering provider wiring (compiled `background_image_prompt` + `negative_prompt` are persisted ready, but no model is called).
    - No deterministic overlay renderer (Satori/sharp/etc.).
    - No changes to `Post.image_url` (operator-driven; pre-dispatch validation already in place).
    - No changes to Brand Management UI, Event Visual Override UI, or Refine modal.
    - No removal of the legacy free-text design notes (deprecated UI section already in place; prompt builder never read them anyway).
    - No new env vars, no Prisma migration, no API surface change.
  - Verification:
    - `npx tsc --noEmit` clean (EXIT=0).
    - `npm run visual:smoke` clean (27/27 assertions across 6 cases) — confirms the compiler itself is unchanged.
    - **End-to-end NOT exercised in a browser this session** — terminal-only. After deploy, recommended smoke: (1) trigger a generation from `POST /api/ai/generate-from-fixture` (or from a real Event "Generate Drafts" click), (2) inspect the resulting `Post.generation_context_json.visual_compiled` — confirm all expected keys present + `effective_inputs.overridden_by_event` matches the operator's saved overrides.
  - Per the durable commit-batching rule: ROADMAP + 3 docs + WORKLOG + 6 source files land in the same commit.

### 2026-04-27
- Task: Phase 4 — Event Visual Override UI + persistence
  - Status: Complete (UI shipped, validation wired, migration applied via deploy)
  - Why: Phase 4 follow-up #2 from 2026-04-23. Brand visual defaults shipped earlier today; this is the matching event-level override layer. Operators can now define ONLY what is special for a specific event while everything unspecified falls through to the brand defaults via `compileVisualPrompt()`.
  - Persistence: new `Event.visual_settings_json Json?` column. Migration `20260427150000_event_visual_settings_json` (one `ALTER TABLE "events" ADD COLUMN "visual_settings_json" JSONB;`). Field is nullable — events without an override block load cleanly.
  - Files modified:
    - `prisma/schema.prisma` — added `visual_settings_json Json?` to `Event` with a doc comment pointing at the validation schema.
    - `prisma/migrations/20260427150000_event_visual_settings_json/migration.sql` — new directory; non-destructive ALTER TABLE.
    - `src/lib/ai/visual/validation.ts` — added `coerceEventVisualOverride()` tolerant reader (drops out-of-enum legacy values, returns clean `EventVisualOverrideInput`). Module-header comment updated to reflect both Brand + Event are now wired.
    - `src/lib/validations/event.ts` — imported `eventVisualOverrideSchema`; extended `createEventSchema` + `updateEventSchema` with `visual_settings_json: eventVisualOverrideSchema.nullable().optional()`.
    - `src/app/api/events/route.ts` — POST handler destructures `visual_settings_json` and uses the same `Prisma.JsonNull` pattern as `posting_instance_json`.
    - `src/app/api/events/[id]/route.ts` — PATCH handler: same pattern. PATCH always writes `visual_settings_json` so operators can clear overrides by saving an empty block (round-trips as null).
    - `src/lib/events-api.ts` — added `visual_settings_json: EventVisualOverrideInput | null` to client `Event` interface.
    - `src/components/ui/tag-input.tsx` — **new shared component** extracted from the brand page's local `TagInput`. Adds an optional `maxItems` prop. Brand page keeps its local copy for now (out of scope to refactor today per the brief); future cleanup can DRY.
    - `src/app/(app)/events/new/page.tsx` — extended `FormData` with 6 visual-override fields (`v_*` prefix), added `buildVisualOverridePayload()`, inserted "Visual Override (optional)" SectionHeader between "Notes for AI" and "Posting Schedule" with 4 selects + tag input + 200-char visual_notes.
    - `src/app/(app)/events/[id]/page.tsx` — extended `EditData` with the same 6 fields, `initEditData()` calls `coerceEventVisualOverride()` to seed from the saved JSON, `saveEdit()` always writes `visual_settings_json: buildVisualOverridePayload(editData)` (object or null). New "Visual Override" card sits between Campaign Brief and Posting Schedule. Read mode lists only the overridden fields, or "Using brand defaults — no event-level overrides." when empty.
    - `docs/02-data-model.md` — added `visual_settings_json` field to the events table doc with full shape + migration ref.
    - `docs/03-ui-pages.md` — Events Create page → Section E flipped from "Planned Visual Override" to "Visual Override (Simple Mode) — UI shipped 2026-04-27" with full control table.
    - `docs/07-ai-boundaries.md` — added "Event-level override persistence (UI shipped 2026-04-27)" paragraph alongside the existing Brand-level one.
    - `docs/00-architecture.md` — Visual input architecture "Product rule" extended to mention the Event-level persistence + migration name.
    - `ROADMAP.md` — Phase 4 sub-bullet 2 flipped 🟢 → ✅.
    - `WORKLOG.md` — this entry; Ongoing entry removed.
  - Visual override fields delivered (each Select offers an explicit "Use brand default" first item):
    - `visual_emphasis` (Select, optional)
    - `main_subject_type` (Select, optional)
    - `layout_family` (Select, optional)
    - `platform_format` (Select, optional)
    - `negative_visual_elements` (TagInput, max 20) — layered on top of brand-level negatives at compile time
    - `visual_notes` (textarea, optional, max 200 chars with live counter)
    - `visual_style` intentionally NOT in the Event override layer — stays brand-level for cross-event consistency.
  - Validation wiring:
    - `eventVisualOverrideSchema.nullable().optional()` inside both create + update schemas — invalid enums reject cleanly via Zod's existing 422 path.
    - `coerceEventVisualOverride()` provides defence-in-depth on read: out-of-enum legacy values are silently dropped (form falls back to "Use brand default" for that field).
    - Empty / blank fields are dropped on save: blank `visual_notes` becomes absent; empty negative arrays become absent; empty whole-block becomes `null`.
  - Brand base vs Event override preserved:
    - Brand Management remains the base visual rule layer (`design_settings_json.visual_defaults`).
    - Event override is a **partial** override — `compileVisualPrompt()` already merges Brand ← Event field-by-field with `overridden_by_event[]` audit echo (see `src/lib/ai/visual/compile.ts`).
    - `visual_style` has no Event override slot — Brand-level only.
    - Templates & Assets remains a non-rule supporting library (unchanged).
  - Backward compatibility:
    - Events with `visual_settings_json = null` load cleanly (read panel says "Using brand defaults"; edit form has all selects on "Use brand default", empty tag list, empty notes).
    - Events with partial overrides round-trip cleanly via `coerceEventVisualOverride()`.
    - Hand-edited JSON with bogus enum values doesn't crash the form — bogus values are silently dropped on read.
  - Out of scope (deliberately):
    - Brand Management UI not modified.
    - AI text generation pipeline not modified.
    - `runGeneration()` not yet wired to call `compileVisualPrompt(brand_visual_defaults, event_visual_settings, ...)` — separate small follow-up.
    - No image-rendering provider, no overlay renderer (Phase 4 follow-ups #5/#6).
    - The local `TagInput` in `src/app/(app)/brands/page.tsx` is NOT refactored to use the new shared component (out of scope per the brief).
  - Verification:
    - `npx prisma generate` clean.
    - `npx tsc --noEmit` clean (EXIT=0).
    - **UI not exercised in a browser this session** — terminal-only. Manual smoke recommended after deploy: create a new event, fill some override fields + leave others on "Use brand default", save, refresh, confirm the read panel shows only the fields you set; then edit, clear them, save again, confirm round-trip.
  - Per the durable commit-batching rule: ROADMAP + 4 docs + WORKLOG + Prisma schema + migration + 6 source files land in the same commit.

### 2026-04-27
- Task: UI polish — shared Select dropdown content sizing
  - Status: Complete (1 file changed; UI styling only, no logic, no schema, no API)
  - Why: Long option labels (`"Professional — formal and authoritative"`, `"Reward-forward — the prize is the hero"`, etc.) were getting clipped horizontally when dropdowns opened — especially in the Brand Management modal Voice & Tone + Design tabs. Root cause: `SelectContent` was clamped to trigger width via `w-(--anchor-width)` + `overflow-x-hidden`, while `SelectTrigger` uses `w-fit` (sizes to current value, not longest option).
  - Files modified:
    - `src/components/ui/select.tsx` — `SelectContent` className tweaks: `w-(--anchor-width)` → `min-w-(--anchor-width)` (popup at least trigger width, free to grow); removed `min-w-36` (superseded); added `max-w-[min(36rem,calc(100vw-2rem))]` (caps growth on desktop + small screens); removed `overflow-x-hidden` (no longer needed once width grows to fit). No prop / API / Base UI option changes.
    - `WORKLOG.md` — this entry.
  - Why a shared fix:
    - 11 caller sites import the Select primitive (calendar, audit-logs, queue, brands, insights, events list/new/detail, channels, automations, event-datetime-picker). None pass a custom className to `SelectContent` (verified via grep). One className change in the shared component fixes every dropdown in the app.
  - Out of scope:
    - `dropdown-menu.tsx` (used for filter chips / multiselect, different surface).
    - `SelectTrigger` `w-fit` behavior (correct as-is — trigger should size to the current value).
    - Any visual redesign of the popup (border / shadow / padding / animation unchanged).
  - Verification:
    - `npx tsc --noEmit` clean (EXIT=0).
    - **UI not exercised in a browser** this session — terminal-only. Worth a manual smoke after deploy: open Brand Management → Edit → Voice & Tone (Tone / CTA Style / Emoji Level) and Design (5 visual selects) — option text should be fully readable; popup should be at least trigger width but expand when needed.
  - Contingency: if Base UI's Positioner enforces popup width via inline style (rather than CSS variable only), the className-only fix won't be enough and the popup will still be clamped to trigger width. Fallback would be to set `alignItemWithTrigger={false}` as the SelectContent default (Base UI then positions popup as a regular below-trigger dropdown, no width constraint). Not applied yet — start with the className-only fix and observe.

### 2026-04-27
- Task: Phase 4 — Brand Management Design-tab Simple Mode UI
  - Status: Complete (UI shipped, validation wired, docs updated, no migration)
  - Why: Phase 4 follow-up #1 from 2026-04-23 visual-architecture task. Operators were authoring prompt-heavy freeform design notes; this replaces the freeform experience with structured pickers that feed the hidden visual prompt compiler at `src/lib/ai/visual/compile.ts`. First concrete operator-facing surface for the new visual prompt system.
  - Files modified:
    - `src/lib/validations/brand.ts`:
      - Imported `brandVisualDefaultsSchema` + `DEFAULT_BRAND_VISUAL_DEFAULTS` + visual enum/types from `src/lib/ai/visual/`.
      - Extended `designSettingsSchema` with optional `visual_defaults: brandVisualDefaultsSchema`. Optional on the wire so brands created before this UI shipped continue to validate.
      - Extended `DEFAULT_DESIGN_SETTINGS` with `visual_defaults: { ...DEFAULT_BRAND_VISUAL_DEFAULTS }`.
      - Added operator-facing label dictionaries: `VISUAL_STYLE_LABELS`, `VISUAL_EMPHASIS_LABELS`, `MAIN_SUBJECT_TYPE_LABELS`, `LAYOUT_FAMILY_LABELS`, `PLATFORM_FORMAT_LABELS`. Re-exported the canonical enum arrays for the form.
    - `src/app/(app)/brands/page.tsx`:
      - Extended `DesignFormState` with `visual_defaults: BrandVisualDefaultsInput`.
      - Added `coerceVisualDefaults()` — tolerant per-field reader that falls back to canonical defaults for any out-of-enum value (legacy reads survive).
      - `coerceDesign()` now reads `visual_defaults` from raw JSON; `designToPayload()` always emits a valid `visual_defaults` block (trims negatives, drops blank `visual_notes`); `emptyForm()` seeds `DEFAULT_BRAND_VISUAL_DEFAULTS`.
      - Added `setVisualDefault<K>` setter helper alongside the existing `setLogo` / `setBenchmarkAssets`.
      - Restructured the Design tab UI: framing line → Simple Mode (5 Selects + TagInput for negatives + optional 200-char `visual_notes`) → Benchmark Assets → Legacy free-text design notes inside a `<details>` collapsed section labelled "deprecated" with amber accent + helper text. Reused the existing `TagInput`, `FieldLabel`, `Select`, and `BenchmarkAssets` components — no new components introduced.
    - `docs/03-ui-pages.md` — Brand Management → D. Design section rewritten: "Planned Simple Mode Visual Defaults" → "Simple Mode Visual Defaults (UI shipped 2026-04-27, primary path)" with control table; legacy fields documented as deprecated collapsed section.
    - `docs/07-ai-boundaries.md` — added "Brand-level persistence (UI shipped 2026-04-27)" paragraph in the Visual input architecture section. Documents persistence into `design_settings_json.visual_defaults`, validation flow, optional-on-wire shape, and legacy field deprecation.
    - `docs/02-data-model.md` — `design_settings_json` field documentation extended with the `visual_defaults` shape; legacy free-text fields explicitly tagged `(legacy)`.
    - `docs/00-architecture.md` — "Image generation — visual input architecture" subsection updated: "No schema has landed for this yet" → "Brand-level visual defaults are now authored on the Brand Management → Design tab Simple Mode form (UI shipped 2026-04-27) and persist into `Brand.design_settings_json.visual_defaults`."
    - `ROADMAP.md` — Phase 4 sub-bullet 1 flipped from 🟢 (spec done) → ✅ (UI shipped).
    - `WORKLOG.md` — this entry; Ongoing entry removed.
  - Simple Mode fields delivered:
    - `visual_style` (Select, required, no Event override)
    - `visual_emphasis` (Select, required)
    - `main_subject_type` (Select, required)
    - `layout_family` (Select, required)
    - `platform_format_default` (Select, required)
    - `negative_visual_elements` (TagInput, max 20)
    - `visual_notes` (textarea, optional, max 200 chars with live counter)
  - Persistence:
    - Stored at `Brand.design_settings_json.visual_defaults` (JSON column already existed; no Prisma migration).
    - PATCH `/api/brands/[id]` already routes through `updateBrandSchema` → `designSettingsSchema`, so wiring `brandVisualDefaultsSchema` was a single import + one extra field in `designSettingsSchema`.
    - Empty/blank `visual_notes` is dropped on save so the compiler skips the optional brand-note section cleanly.
    - Negative tags are trimmed; empties dropped.
  - Validation wiring:
    - `designSettingsSchema.visual_defaults = brandVisualDefaultsSchema.optional()` — invalid enum values reject cleanly with Zod's existing 422 path.
    - `coerceVisualDefaults()` provides defence-in-depth on read: legacy or hand-edited JSON with bad values doesn't blow up the form — it falls back to canonical defaults so operators can re-pick.
    - Optional on the wire for forward compatibility; required-shape inside the form (always valid because the form seeds defaults).
  - Legacy free-text design fields:
    - Six fields (`design_theme_notes`, `preferred_visual_style`, `headline_style`, `button_style`, `promo_text_style`, `color_usage_notes`) are NOT removed — kept readable + editable for backward compatibility.
    - Moved into a `<details>` collapsed section under Visual Defaults with a "deprecated" amber chip + amber-bordered container + helper text: "These free-text fields predate the structured Visual Defaults above. They are kept readable + editable for now but are no longer the authoritative visual rule source — the AI generator reads Visual Defaults. New brands should leave these blank."
    - Removal is a follow-up once operators have migrated. Schema still accepts them; `designToPayload()` still strips empty strings to `undefined`.
  - Out of scope (deliberately):
    - Event Visual Override UI — separate Phase 4 follow-up #2.
    - `src/lib/ai/load-brand.ts` not touched — the loader will surface `visual_defaults` to the visual compiler as a separate plumbing task.
    - No image-rendering provider, no overlay renderer (Phase 4 follow-ups #5/#6).
    - No object storage / file upload changes.
    - No edits to other Brand Management tabs (Identity, Integration, Voice & Tone, Sample Captions).
  - Verification:
    - `npx tsc --noEmit` clean (EXIT=0).
    - `npx eslint src/lib/validations/brand.ts 'src/app/(app)/brands/page.tsx'` — 0 errors, 2 pre-existing warnings (`optionalHex` and `DEFAULT_DESIGN_SETTINGS` were already in the import list before this task).
    - **UI not exercised in a browser** — this session is terminal-only. The shape is verified by the type system + lint, and the structure mirrors the existing tabs (same `Select` / `TagInput` / `FieldLabel` patterns the Voice & Tone tab uses), but a manual smoke in a browser is recommended before relying on it for live operator work.
  - Backward compatibility surfaces remaining:
    - Legacy free-text fields persist and round-trip through the API + form.
    - Brands without a `visual_defaults` block load cleanly (form seeds defaults; save writes them).
    - `coerceVisualDefaults()` tolerates out-of-enum stored values without rejecting the load.
  - Per the durable commit-batching rule: ROADMAP + 4 docs + WORKLOG + 2 source files land in the same commit.

### 2026-04-27
- Task: Long-term architecture direction docs — OMEGA compatibility + market adaptability (docs only)
  - Status: Complete (docs-only, no code, no schema, no migration)
  - Why: clarify the long-term destination so today's architectural
    choices don't foreclose (a) future ingestion of external
    intelligence signals (OMEGA being the canonical example) or (b)
    multi-market expansion beyond Philippines. MVP scope and current
    phase priorities (Phase 3 / 4 / 5) are unchanged.
  - Files modified:
    - `ROADMAP.md` — new `## LONG-TERM ARCHITECTURE PRINCIPLES`
      section appended after `## CORE PRODUCT RULES`. Two principles:
      (1) stay signal-source-agnostic (OMEGA compatibility); (2) stay
      market-adaptable. Explicit out-of-scope statement reaffirming
      Phase 3 / 4 / 5 priorities.
    - `docs/00-architecture.md` — new `## Long-term direction`
      section appended after `## Design Principles`. Two subsections:
      External intelligence signals (extension seam:
      `SourceFacts` / `source-normalizers/` / `runGeneration()` /
      `NormalizedGenerationInput`; cross-system pattern: Manus-style
      HTTP/JSON boundary) + Market profile layer (forward layering
      `Market → Brand → Source facts → Event override → Templates`).
    - `docs/07-ai-boundaries.md` — one forward-direction paragraph
      inserted inside the existing "Context layers (base → override)"
      subsection (between Adhoc Event brief item and "Example packet
      shape:" line). Doesn't change the current 2-layer spec; names
      future Market layer + future external intelligence signals.
    - `WORKLOG.md` — this entry.
  - Framing locked:
    - mkt-agent is the **execution layer**; OMEGA is a separate
      intelligence layer. Cross-system traffic follows the Manus
      pattern (HTTP/JSON, secret-gated, signed callbacks if needed).
      No shared DB / deploy / SDK.
    - "OMEGA" is the canonical example, not a named coupling — the
      principle covers any future external intelligence source on
      equal footing.
    - Future context layering may grow into Market → Brand → Source
      facts → Event override → Templates. Not a near-term build.
    - Tagalog / GCash / PAGCOR are PH-specifics that belong on Brand
      Management fields, not global defaults.
  - Verification:
    - All four docs read end-to-end for internal consistency.
    - Cross-references between ROADMAP / 00-architecture / 07
      resolve correctly.
    - Source-code paths referenced
      (`src/lib/ai/types.ts`, `src/lib/ai/source-normalizers/`,
      `src/lib/ai/generate.ts`, `src/lib/ai/resolve-context.ts`)
      all exist and are accurate.
    - No code change, no Prisma schema change, no migration.
  - Per the durable commit-batching rule: ROADMAP + docs + WORKLOG
    land in the same commit.

### 2026-04-23
- Task: Phase 4 — Visual input architecture + hidden prompt compiler (spec + backend)
  - Status: Complete (backend + spec + docs; UI rollout, image model, and overlay renderer remain as follow-ups)
  - Files added (new module `src/lib/ai/visual/`):
    - `types.ts` — canonical enums (`VISUAL_STYLES`, `VISUAL_EMPHASES`,
      `MAIN_SUBJECT_TYPES`, `LAYOUT_FAMILIES`, `PLATFORM_FORMATS`) +
      typed interfaces (`BrandVisualDefaults`, `EventVisualOverride`,
      `LayoutTemplate`, `SafeZone` / `TextZone` / `LogoSlot` /
      `GradientOverlay`, `CompiledVisualPrompt`, `SafeZoneConfig`,
      `RenderIntent`). `visual_style` intentionally omitted from
      `EventVisualOverride` to keep brand-level consistency across a
      brand's event lineup.
    - `layouts.ts` — `LAYOUT_TEMPLATES` record: `center_focus`,
      `left_split`, `right_split`, `bottom_heavy`. Each carries
      resolution-independent text zones, safe zones
      (quiet/solid_background/gradient_darkened/empty), a logo slot,
      optional gradient overlay, CTA alignment, and emphasis area.
      `DEFAULT_LAYOUT_BY_FORMAT` + `resolveLayout(preferred, format)`
      handle format-incompatibility fallback.
    - `compile.ts` — `compileVisualPrompt()` pure function. Takes
      `{brand, event?, platform, source_facts?}` and returns
      `CompiledVisualPrompt`. Flow: resolve effective inputs
      (Brand ← Event per-field with `overridden_by_event` tracking) →
      resolve platform format (Event > platform-appropriate > Brand
      default) → pick layout → derive subject focus from source
      facts when available → compose positive prompt
      (style → emphasis → subject → emphasis_area → aspect →
      safe-zone instruction → brand/event notes → hardcoded "no
      text" rule) → compose negative prompt starting from
      `BASELINE_NEGATIVES` (text / letters / numbers / typography /
      watermarks / brand names drawn / logos drawn in pixels /
      subtitles / signage / UI elements / menus / buttons) plus
      Brand + Event negatives, deduped. `render_intent` locked to
      `"ai_background_then_overlay"`.
    - `validation.ts` — `brandVisualDefaultsSchema` +
      `eventVisualOverrideSchema` Zod schemas + `DEFAULT_BRAND_VISUAL_DEFAULTS`.
      Standalone — NOT yet wired into existing brand/event Zod
      validators or API routes, so the shape lands without touching
      live surfaces. UI task wires it in when it arrives.
    - `scripts/visual-compile-smoke.ts` — live compiler smoke test.
  - Files modified:
    - `package.json` — added `visual:smoke` npm script.
    - `docs/00-architecture.md` — "Image generation" paragraph
      replaced with a full "Visual input architecture" subsection:
      module layout, precedence, smoke-test pointer, explicit
      out-of-scope note.
    - `docs/03-ui-pages.md` — Brand Management Design tab + Event
      create form gain "Planned Simple Mode" sub-bullets documenting
      the target UI shape (structured pickers, not prose fields).
    - `docs/07-ai-boundaries.md` — new locked PRODUCT RULE: "AI
      generates backgrounds only; app renders final text + logos via
      deterministic overlay." Full Simple Mode control table.
      Explicit note that `BASELINE_NEGATIVES` cannot be shadowed or
      overridden. Safe zones documented as a first-class concept
      (injected into positive prompt AND echoed in `safe_zone_config`
      for the renderer).
    - `ROADMAP.md` — Phase 4 item 4 sub-bullets updated: 4 of 6 now
      have status markers (1 + 2 🟢 spec done, 4 + 5 ✅ code done,
      3 + 6 ⏳ pending UI/renderer).
  - Product rule locked (documented in docs/07 + enforced in
    compile.ts): **AI image model generates BACKGROUNDS/ART ONLY.
    Never text, letters, numbers, typography, brand names drawn in
    pixels, watermarks, logos, UI elements, or signage.** The
    hardcoded `BASELINE_NEGATIVES` list enforces this in every
    compiled output regardless of Brand/Event inputs. The app
    renders FINAL TEXT + LOGOS as a deterministic overlay.
  - Precedence preserved and explicitly documented: Brand
    Management (base) → source facts (context) → Event brief
    (override, per-field) → Templates (supporting library, never
    authoritative). `visual_style` has no Event override by design.
  - Safe zones are first-class:
    - Each layout template declares explicit zones with
      resolution-independent rectangles.
    - Compiler injects zone descriptions into the positive prompt
      ("Composition must leave these zones visually quiet so text
      can be overlaid later: …").
    - Compiler also echoes zones in `safe_zone_config` of the
      output so the overlay renderer knows where to composite text.
    - AI is never trusted to place readable space perfectly on its
      own.
  - Compiler output shape:
    - `background_image_prompt` — full positive prompt for image
      model (AI input)
    - `negative_prompt` — forbidden content, baseline + brand + event
    - `layout_key` — `LayoutFamily` the renderer will use
    - `safe_zone_config` — `{ zones, gradient_overlay? }`
    - `render_intent` — locked `"ai_background_then_overlay"`
    - `platform_format` — resolved format
    - `visual_emphasis` — echoed for renderer
    - `subject_focus` — concrete subject string (derived from source
      facts when present)
    - `effective_inputs` — audit echo: `{visual_style, visual_emphasis,
      main_subject_type, layout_family, overridden_by_event}`
  - Verification:
    - `npx tsc --noEmit` clean (after a precedence fix on platform
      format resolution — TikTok and similar platforms now correctly
      resolve to their natural format even when Brand's generic
      default is square).
    - `npm run visual:smoke` — **27/27 assertions passed across 6
      cases**: brand-defaults + big_win facts, event override wins
      for layout + emphasis, layout fallback when preferred doesn't
      support format, negative prompt always includes baseline
      anti-text, platform format override on event wins, no-facts
      subject fallback.
  - What's ready to plug in (once the next tasks land):
    - Image model adapter can consume `background_image_prompt` +
      `negative_prompt` + `platform_format` directly
    - Overlay renderer can consume `layout_key` + `safe_zone_config`
      + Post text fields directly
    - Brand/Event UI forms can use the Zod schemas without changes
  - Follow-ups (out of scope for this task, in rough priority order):
    1. Brand Management Design-tab UI — add Simple Mode structured
       visual defaults (pickers + tag input); persist into existing
       `design_settings_json`
    2. Event form UI — add Visual Override section; requires new
       `Event.visual_settings_json` Prisma column (migration)
    3. Wire `brandVisualDefaultsSchema` / `eventVisualOverrideSchema`
       into `src/lib/validations/brand.ts` + `src/lib/validations/event.ts`
       once persistence exists
    4. Deprecate the six free-text design notes once operators have
       migrated to Simple Mode (read-only during transition)
    5. Image-rendering provider adapter (Stable Diffusion / Imagen /
       similar) + `compileVisualPrompt()` wiring into the AI
       generation flow
    6. Deterministic overlay renderer (Satori + sharp or similar)
       that reads `safe_zone_config` and composites text + logos on
       top of the AI background

### 2026-04-23
- Task: docs — promote "Visual Prompt Simplification + Hidden Prompt Compiler" to near-term Phase 4 priority
  - Status: Complete (docs-only, no code)
  - Why this is being prioritized NOW:
    - Operator input experience for image generation is too
      prompt-heavy. Regular operators are not skilled enough to
      write detailed visual prompts reliably, and we do NOT want
      them to become prompt engineers.
    - AI-rendered typography is unreliable for branded overlays
      (reward amount, banner text, logo).
    - Image generation must land AFTER this foundation, not
      before — otherwise the image-rendering provider gets built
      against the wrong input surface.
  - Intended split pipeline:
    - AI → background / art only
    - App → final text + logo overlays, rendered server-side
  - What changed in the roadmap:
    - Phase 4 item 4 expanded from a single "deferred" bullet into
      a 6-part structured subsection: simplify Brand visual
      defaults; simplify Event visual override inputs; replace
      freeform prompt fields with structured controls; build a
      hidden prompt compiler; define layout template specs +
      safe-zone rules; deterministic app-side text/logo overlay
      rendering.
    - Image-rendering provider work (originally item 4) explicitly
      re-positioned as sub-item 7, dependent on 1–6.
    - Existing "supporting plumbing already shipped 2026-04-23"
      note preserved (Post.image_url + media validation + queue
      detail UI + preview render) — nothing deleted.
    - Items 1, 2, 3, 5, 6, 7 of Phase 4 unchanged.
  - Docs updated:
    - docs/00-architecture.md — "Image generation. Deferred."
      paragraph replaced with a forward-looking note about the
      split pipeline + pointer to the ROADMAP section.
    - docs/07-ai-boundaries.md — image_prompt clarification gains
      one "Future shape (Phase 4 priority)" paragraph describing
      the structured-input + hidden-compiler direction.
  - No Ongoing Tasks entry — nothing is being built yet. The first
    concrete implementation step (audit Brand Management visual
    fields + design structured-input schema) kicks off as its own
    task when picked up.
  - No code, no schema, no Prisma migration.

### 2026-04-23
- Task: Phase 2 hardening — `Post.image_url` field + UI / API / media handoff plumbing
  - Status: Complete
  - Goal: activate the pre-dispatch media validation layer (shipped
    in the previous task) by giving posts a real `image_url` field.
    MVP shape is a nullable single URL — matches media-validation's
    expectation, keeps the change tight, and evolves cleanly into
    richer media arrays later without another dispatcher-code
    change.
  - Final field shape chosen: `Post.image_url String?`
    (nullable TEXT column). `image_prompt` remains separate +
    unchanged — it is narrative AI input, NEVER a URL.
  - Migration name: `20260423120000_post_image_url` — one
    `ALTER TABLE "posts" ADD COLUMN "image_url" TEXT;` (non-destructive,
    backfill-safe for existing rows).
  - Files modified:
    - `prisma/schema.prisma` — added the nullable column with a
      triple-slash doc comment pointing at the media-validation
      module.
    - `prisma/migrations/20260423120000_post_image_url/migration.sql`
      — the schema migration (new directory).
    - `src/lib/validations/post.ts` — new `optionalImageUrl` Zod
      preprocess: empty/whitespace → `undefined` (follows existing
      save-with-empty convention so a blank save doesn't overwrite a
      stored URL), non-empty → `z.string().url().max(2048)`. Scheme
      check (http/https) deliberately NOT duplicated here — it lives
      in media-validation.ts. Applied to both `createPostSchema` and
      `updatePostSchema`.
    - `src/lib/posts-api.ts` — added
      `image_url: string | null` to the client-side `Post`
      interface with a JSDoc pointer.
    - `src/lib/manus/media-validation.ts` — `collectMediaUrls(post)`
      now returns `[post.image_url]` when the URL is a non-empty
      trimmed string, `[]` otherwise. Signature simplified from
      `Pick<Post, "image_prompt">` to `Pick<Post, "image_url">` to
      reflect the source-of-truth correction (`image_prompt` is
      narrative only). No dispatcher-code change needed — the
      collector is already called with the full Post.
    - `src/app/(app)/queue/[id]/page.tsx`:
      - `startEdit()` seeds `image_url` into editData
      - Edit mode: new `EditableField` under "Image Prompt" with a
        helper line ("Public URL for publishing. Must be reachable
        (http or https). Leave blank for text-only posts.")
      - Read mode: `<Field label="Image URL" value={post.image_url} />`
      - Post preview now renders the image via `<img>` with
        `object-cover` when `image_url` is set; falls back to the
        existing banner_text placeholder on load error (browser
        CORS / hotlink resilience — pre-dispatch validation is the
        real reachability gate).
    - `src/app/api/posts/[id]/route.ts` — PATCH route's audit log
      `before` snapshot now captures `image_prompt` and `image_url`
      alongside the existing text fields.
    - `docs/02-data-model.md` — Post field list gains `image_url`
      with purpose + pointer to media-validation.ts;
      `image_prompt` line clarified as "narrative AI input, never a
      URL".
    - `docs/03-ui-pages.md` — Post detail section gains an
      "Image URL field (2026-04-23)" bullet covering edit gating,
      operator hint text, Zod syntactic check, pre-dispatch
      reachability check, and preview-image rendering behavior.
    - `docs/07-ai-boundaries.md` — the previously-forward-looking
      line about a "future `media_urls`" field replaced with
      confirmation that `Post.image_url` has landed; clarifies the
      AI generator populates only `image_prompt`, not `image_url`.
    - `docs/00-architecture.md` — the Manus media handoff
      subsection's "URL source" paragraph replaced: dispatcher hook
      now live-sourced, no longer a no-op; still `string[]` return
      type for future carousel growth.
  - Where `image_url` is now accepted / displayed:
    - Accepted at create + update (PATCH) via the Zod schemas
    - Displayed in queue detail read mode (Field row)
    - Editable in queue detail edit mode (EditableField + hint),
      gated to Draft / Rejected via existing refine-after-approval
      rule
    - Rendered in the post preview image area (with onError
      fallback to banner_text placeholder)
    - Audited — PATCH route's `before` snapshot records it
  - How dispatcher / media validation now use it:
    - Dispatcher calls `collectMediaUrls(post)` exactly as before
    - `collectMediaUrls` now returns `[post.image_url]` when set
      instead of always-empty
    - `validateMediaUrls()` runs syntactic + scheme + host-privacy
      + reachability (HEAD with GET-Range fallback, 5s timeout,
      3-hop redirect cap) — unchanged from the prior task
    - On validation failure: delivery marked `failed` with
      `[MEDIA_ERROR] <reason>`, parent post reconciled, `continue`
      skips `dispatchToManus()` — unchanged path
    - Log line `[manus-media] delivery=<id> platform=<p> urls=N
      result=ok|failed issues=<reasons> action=dispatched|blocked`
      now fires for posts that carry an image_url; text-only
      deliveries still emit zero media lines
  - Verification:
    - `npx tsc --noEmit` clean
    - `collectMediaUrls()` sanity-tested against 5 shape cases
      (null / blank / empty / valid URL / URL with whitespace) —
      all behaved as documented; whitespace is trimmed before
      dispatch.
  - What remains deferred:
    - Real media-URL source flows — today populated by operator
      hand-entry at the queue detail edit surface; AI image
      generation that auto-populates `image_url` is a separate
      future task (image-rendering provider, asset hosting).
    - Multi-image / carousel / per-platform-variant support — the
      return type of `collectMediaUrls()` is already `string[]`,
      but the field is single-image; shape evolution needs a
      column migration + collector update.
    - File upload / object storage — no change; operators provide
      externally-hosted URLs.
    - Per-platform media constraints (aspect ratio, mime type,
      size caps, video duration, carousel constraints) — still
      out of scope.
    - "Clear image_url" UX — following the repo-wide
      empty-save-doesn't-overwrite convention; if operators need
      to explicitly unset a stored URL, a small API extension can
      handle that later.
  - Docs updated: `docs/00-architecture.md`, `docs/02-data-model.md`,
    `docs/03-ui-pages.md`, `docs/07-ai-boundaries.md`, `WORKLOG.md`.

### 2026-04-23
- Task: Phase 2 hardening — Manus media handoff + public URL validation
  - Status: Complete
  - Goal: gate the Manus dispatch path with a pre-dispatch media URL
    reachability check so that when per-post media URLs start flowing
    (future `Post.image_url` or AI image generation), broken /
    private / unreachable URLs fail fast with `[MEDIA_ERROR] <reason>`
    instead of round-tripping through Manus. Plumbing-first: today no
    per-post URL field exists, so `collectMediaUrls(post)` returns
    `[]` for every delivery and the dispatcher hook is a no-op.
    Validation itself is provably correct today via the live smoke.
  - Files added:
    - `src/lib/manus/media-validation.ts` — pure validator. Exports
      `MediaValidationReason` (union: `invalid_url` /
      `unsupported_scheme` / `private_host` / `unreachable` /
      `http_error`), `MediaValidationIssue`, `MediaValidationResult`,
      `validateMediaUrl(url, opts?)`, `validateMediaUrls(urls, opts?)`
      (dedupes + runs in parallel), `formatMediaErrorMessage(result)`
      (builds "first issue (+N more)" string for `last_error`),
      `logMediaCheck(args)`, `collectMediaUrls(post)` — extension
      point returning `[]` today; documented to return
      `[post.image_url]` once that field exists.
    - `scripts/media-validation-smoke.ts` — live smoke test hitting
      real URLs. Covers all 6 outcomes (`pass`, `http_error`,
      `private_host` ×5 flavors, `unreachable`, `invalid_url`,
      `unsupported_scheme` ×2 flavors), plus empty-array + dedup
      edge cases.
  - Files modified:
    - `src/lib/manus/dispatcher.ts` — imports the validation module
      and `reconcilePostStatus`; inserts the pre-dispatch
      collect → validate → log → mark-failed branch between payload
      build and `dispatchToManus()`. Text-only deliveries short-circuit
      (`mediaUrls.length === 0`). Failed validation marks the row
      `failed` with `[MEDIA_ERROR] <reason>`, runs reconciler, adds
      to `summary.errors`, `continue`s the loop (skipping Manus).
    - `package.json` — added `media:smoke` npm script.
    - `docs/00-architecture.md` — new "Manus media handoff +
      pre-dispatch URL validation (2026-04-23)" subsection under the
      Manus protocol block. Documents validation steps, dispatcher
      integration, today's no-op behavior, retryability linkage,
      log format, and explicit out-of-scope list.
    - `docs/06-workflows-roles.md` — "Delivery retry classification"
      block gains a bullet explaining pre-dispatch MEDIA_ERROR flows
      through the same Fatal path as Manus-side MEDIA_ERROR
      (identical operator UX).
    - `docs/07-ai-boundaries.md` — small clarification that
      `image_prompt` is narrative text (AI input) and is NEVER a URL;
      URLs travel in a separate `media_urls` publish_payload field
      (future), validated by `src/lib/manus/media-validation.ts`.
  - Validation steps (short-circuit in this order):
    1. Syntactic — `new URL(raw)` must parse
    2. Scheme — http / https only
    3. Host privacy — rejects localhost, `.local` / `.localhost`
       suffixes, IPv4 loopback + RFC1918 + link-local + 0/8, IPv6
       `::1`, link-local `fe80::/10`, ULA `fc00::/7`
    4. Reachability — HEAD with 5s timeout, 3-hop manual redirect
       cap (re-checks host privacy on every hop to block
       open-redirect-to-internal-target), GET `Range: bytes=0-0`
       fallback on HEAD 405/501 or network error
  - Failures stored as `[MEDIA_ERROR] <formatted reason>` in
    `PostPlatformDelivery.last_error`. Existing retryability layer
    already maps MEDIA_ERROR → fatal → UI shows "Fix required" +
    backend retry returns 422. **Zero changes** to classifier, UI,
    retry route, or callback route.
  - Observability: `[manus-media] delivery=<id> platform=<p>
    urls=<N> result=<ok|failed> issues=<reason1,reason2>
    action=<dispatched|blocked>` — one line per check, zero lines
    when no URLs present, no URL values logged (length only).
  - Verification captured:
    - `npx tsc --noEmit` clean.
    - `npm run media:smoke` — 13/13 cases matched expected outcomes.
      Every `MediaValidationReason` branch exercised against real
      inputs: httpbin 200 → pass, httpbin 404 → http_error (status
      visible), localhost + 127.0.0.1 + 10.0.0.1 + 192.168.1.1 +
      169.254.1.1 + IPv6 `::1` + `printer.local` → private_host,
      `*.invalid` TLD → unreachable, malformed string → invalid_url,
      `ftp://` + `file://` → unsupported_scheme. Empty-array case:
      `ok=true, checked=[], issues=[]` with no fetch. Dedup case:
      2 identical inputs → 1 checked.
  - Ready-to-plug: activating for real traffic is a one-line code
    change in `collectMediaUrls()` once `Post.image_url` (or similar)
    is added. The dispatcher wiring, failure path, reconciler
    integration, classification, UI, and logs all already work end
    to end.
  - Recommended next Manus hardening task: **`Post.image_url` schema
    extension** (a single nullable column migration) to activate this
    validation layer for real traffic. Alternative: per-platform
    media rules (aspect/mime/size/duration) once real per-platform
    specs are available; reclaim pass for pre-existing
    stuck-in-publishing rows when `accepted=false` leaves the row
    hung.

### 2026-04-23
- Task: Phase 2 hardening — Manus platform-specific handoff payload mapping
  - Status: Complete
  - Goal: inject a platform-aware shaping step between the generic
    delivery row and the Manus handoff so each target platform gets
    a payload shape it's most likely to need — without redesigning
    the dispatcher, callback, or retry flow. Mapper is pure, typed,
    and shared with no infra changes.
  - Files added:
    - `src/lib/manus/platform-payload.ts` — discriminated
      `PublishPayload` union (Facebook / Instagram / Twitter /
      TikTok / Telegram), `PublishPayloadSource` input shape,
      `buildPublishPayload(platform, source, ctx?)` selector with
      exhaustive-switch guard (`_exhaustive: never` forces new
      platforms to add a mapper), five `map*` functions, and a
      `logPayloadShaping()` helper that emits the per-dispatch
      observability line.
  - Files modified:
    - `src/lib/manus/types.ts` — imported `PublishPayload`; added
      `publish_payload: PublishPayload` to `ManusDispatchPayload`
      with a JSDoc pointer to the mapper + backward-safety note
      about `content`.
    - `src/lib/manus/dispatcher.ts` — extracted the `content` block
      into a local const; called `buildPublishPayload(row.platform,
      content, {delivery_id: row.id})` once per delivery; wired
      `publish_payload` onto the outgoing `ManusDispatchPayload`.
      No change to the claim query, the retry-reset path, or the
      Manus client.
    - `docs/00-architecture.md` — new "Manus platform payload
      mapping (2026-04-23)" subsection with the augmented payload
      shape, per-platform table, observability format, explicit
      "what this layer intentionally does NOT do" list, and
      extension pattern for future platforms. Dispatcher
      description updated to mention the two-block payload.
  - Final handoff payload structure:
    - `ManusDispatchPayload` unchanged at the envelope level (same
      post_id, delivery_id, platform, brand, scheduled_for, source,
      retry_count).
    - `content` kept as the flat backward-safe block.
    - New `publish_payload` field carries the platform-shaped view
      — discriminated by `platform` field so Manus's platform
      routers can `switch` without re-deriving conventions.
  - Per-platform shaping chosen:
    - facebook → `primary_text` (caption → headline fallback) +
      `headline`, `call_to_action`, `banner_text`, `image_prompt`
    - instagram → `caption` (caption → headline fallback) +
      `call_to_action`, `banner_text`, `image_prompt`
    - twitter → `tweet_text` (caption → headline fallback) +
      `call_to_action`, `image_prompt`. NO `banner_text` — X has
      no native overlay.
    - tiktok → `caption` (caption → headline fallback) +
      `call_to_action`, `banner_text`, `image_prompt` (narrative
      anchor, not final video URL)
    - telegram → `text` (caption → headline fallback) + `headline`,
      `call_to_action`, `banner_text`, `image_prompt`. NO
      `parse_mode` hint — deferred until AI content escape-safety
      is confirmed.
  - Type changes: one new field on `ManusDispatchPayload`
    (`publish_payload`). No DB migration, no IAM change, no
    callback protocol change, no retry flow change.
  - Verification captured:
    - `npx tsc --noEmit` clean.
    - Smoke script covered 15 permutations (5 platforms × 3
      content shapes: full content, caption-only, headline-only
      fallback) — every permutation produced the documented
      present/omitted split. X correctly drops `banner_text`;
      caption → headline fallback works on all five platforms;
      null source fields correctly surface as `null` in the
      typed slot.
  - What remains deferred (next Manus tasks, in rough priority):
    - Media pipeline: public-URL verification, per-platform media
      format rules, actual asset hosting. `image_prompt` is still
      narrative-only.
    - Per-platform content validation (e.g. Twitter 280-char
      enforcement, IG caption length, hashtag max counts). The
      mapper's job is shaping, not validation.
    - Telegram `parse_mode` hint once we can prove approved content
      is HTML/Markdown escape-safe.
    - Operator-configurable per-platform shaping overrides (e.g. a
      brand wanting to always omit banner_text on FB). Not needed
      in MVP.

### 2026-04-23
- Task: Phase 2 hardening — Manus retryable vs fatal delivery failure classification
  - Status: Complete
  - Goal: classify Manus delivery failures into `retryable` vs `fatal`
    and surface the distinction in operator-facing UI + retry gating.
    Derivation from stored `last_error` text — no schema migration.
  - Files added:
    - `src/lib/manus/retryability.ts` — pure classifier module:
      - `RETRYABLE_ERROR_CODES` + `FATAL_ERROR_CODES` sets
      - `ERROR_CODE_LABELS` — short operator-facing label per code
      - `parseManusErrorCode(last_error)` — pulls `[CODE]` prefix out
        of stored error; returns null for legacy text-only rows
      - `classifyFailure(last_error)` — returns
        `{retryable, code, source: "classified"|"default", label, hint}`
      - `FATAL_RETRY_REJECTION_MESSAGE` — shared copy for the retry
        route's 422 body
      - Build-time exhaustiveness guard via `_AssertExhaustive` type —
        forces reconciliation when a new `ManusErrorCode` is added
    - No new API route, no new component.
  - Files modified:
    - `src/app/api/posts/[id]/deliveries/[platform]/retry/route.ts` —
      added `classifyFailure()` check after the `status === "failed"`
      guard; returns 422 with `FATAL_RETRY_REJECTION_MESSAGE` on fatal.
    - `src/app/api/posts/[id]/deliveries/route.ts` — enriches each
      delivery row with `failure_class` (null for non-failed rows, full
      classification object for failed rows) so the UI consumes a typed
      flag rather than re-parsing `last_error` client-side.
    - `src/lib/posts-api.ts` — added `DeliveryFailureClass` interface +
      `PlatformDelivery.failure_class` field.
    - `src/components/posts/delivery-status-modal.tsx`:
      - New `FailureClassChip` — retryable (amber) / retryable+unknown
        (muted) / fatal (red). Hover hint shows full operator guidance.
      - Retry button gating — hidden on fatal, shows "Fix required"
        text with hover hint instead.
      - Footer "Retry All Failed" → "Retry All Retryable" (only when
        >1 retryable failure exists); skips fatal rows.
      - Helper note under the table — second red-text line shown when
        any fatal failure is present, telling operator fatal failures
        need content/config fix outside the modal.
    - `docs/00-architecture.md` — new "Retryability layer" subsection
      under "Error taxonomy" with full mapping table + rationale.
    - `docs/03-ui-pages.md` — Delivery Status modal section describes
      the three-way chip + gated Retry buttons.
    - `docs/06-workflows-roles.md` — new "Delivery retry classification"
      subsection under Retries documenting policy + default + backend
      enforcement.
  - Classification mapping chosen:
    - **Retryable**: `NETWORK_ERROR`, `RATE_LIMITED`, `TEMPORARY_UPSTREAM_ERROR`
    - **Fatal**: `AUTH_ERROR`, `INVALID_PAYLOAD`, `MEDIA_ERROR`, `PLATFORM_REJECTED`
    - **Default (retryable, "cause unknown" label)**: `UNKNOWN_ERROR`,
      missing code, unrecognized `[CODE]` prefix, legacy text-only
      errors. Rationale: retry route is role-gated (brand_manager+);
      policy-level rejections are already classified as `PLATFORM_REJECTED`,
      so unknowns are more likely transient than hard rejects; blocking
      retry on pre-taxonomy rows would regress UX without benefit.
  - Retry gating:
    - Backend `/api/posts/.../retry` returns 422 with
      `FATAL_RETRY_REJECTION_MESSAGE` when the classifier returns
      `retryable=false`.
    - UI hides the per-row Retry button on fatal, shows "Fix required".
    - Footer "Retry All Retryable" only appears when >1 retryable exists
      and only iterates over retryable rows.
  - Schema changes: **none**. `failure_class` is derived server-side
    from `last_error` prefix on every GET — no DB column, no migration.
  - Verification captured:
    - `npx tsc --noEmit` clean.
    - Classifier smoke-tested against 11 inputs (all 8 codes + legacy
      no-code + unrecognized-prefix + null) — every case produced the
      expected `retryable` + `source` + `label`.
  - Recommended next Manus task after this: **persisted error_code
    column on PostPlatformDelivery** — would replace the prefix-parse
    with a structured column, unlock filter-by-code in list views, and
    enable metrics-by-code dashboards. Requires a migration so deferred
    until there's a concrete operator ask. Alternative: wire a simple
    "last N failures by code" tile into Insights once metrics tables
    grow.

### 2026-04-23
- Task: Phase 3 — Big Wins + Hot Games BigQuery adapters
  - Status: Complete
  - Goal: ship both live BQ adapters on top of the provisional
    `shared.game_rounds` architecture so they are drop-in-ready the
    moment the table lands. Both degrade gracefully
    (`status: "missing"` — do not crash) while the table is absent.
  - Files added (under `src/lib/big-wins/` + `src/lib/hot-games/`):
    - Each module: `types.ts`, `query.ts`, `normalize.ts`, `adapter.ts`.
    - Big Wins: parameterized SQL joining `game_rounds` + `users` +
      `games`, WHERE brand + `status='settled'` + thresholds combined
      by `logic` ("AND"/"OR") — OR/AND branches at SQL-build time to
      keep parameters clean. Normalizer applies `maskUsername()` and
      falls back to `"[anon]"` on null username. `buildSourceRowKey()`
      uses `bq-big-win-<user>-<timestamp>-<payout>` until platform
      confirms a real `win_id` column exists.
    - Hot Games: aggregation over `game_rounds` joined to
      `shared.games`, rolling window via
      `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL N MINUTE)`,
      `HAVING g.rtp IS NOT NULL`, ranking `g.rtp DESC, round_count DESC`.
      Input validation runs BEFORE any BQ call (window enum, count
      3..10, time_mapping length + `"HH:MM"` regex + strictly-
      ascending per operator rule). Normalizer builds a single frozen
      `HotGamesFacts` snapshot — frozen-snapshot contract from
      docs/07-ai-boundaries.md is honored.
    - Both adapters: missing-table detection via
      `/Not found: Table/i.test(errorMessage)` — same pattern as
      `scripts/bq-smoke-test.ts:195`. Degrade to `status: "missing"`
      without populating `error`; non-missing throws → `status: "error"`
      with `BQ_ERROR`. Never throws on expected conditions.
    - Admin dev routes at `/api/big-wins/fetch-preview` and
      `/api/hot-games/fetch-preview`, gated by shared
      `ALLOW_ADMIN_BQ_PREVIEW=true` env + admin role.
    - CLI scripts
      (`npm run big-wins:preview -- <brand_id> [flags]`,
      `npm run hot-games:preview -- <brand_id> [flags]`) with a
      `--self-check` flag that hand-rolls a raw row through
      `lift → normalize → toFacts` and asserts the shape against the
      AI-pipeline fact interfaces. Auto-runs self-check when adapter
      returns `status: "missing"` — so shape regressions are caught
      today, independent of when `shared.game_rounds` lands.
  - Output layers (per adapter):
    - `result.rows[]` — raw adapter rows for automation-rule eval
      (custom-rule range checks applied caller-side).
    - Big Wins `result.facts[]` — 1:1 with rows, pre-masked, matching
      the exact `BigWinFacts` shape from `src/lib/ai/types.ts`.
    - Hot Games `result.facts` — single frozen `HotGamesFacts`
      snapshot (or null on missing/error).
  - Files modified:
    - `package.json` — added `big-wins:preview` + `hot-games:preview`
      tsx scripts.
    - `.env.production.example` — new `ALLOW_ADMIN_BQ_PREVIEW`
      (default `false`, shared flag for both BQ preview routes).
    - `docs/00-architecture.md` — new "Big Wins live adapter" +
      "Hot Games live adapter" subsections + shared "Verification
      surfaces" block, placed directly after the Running Promotions
      adapter subsection.
    - `docs/04-automations.md` — "Live adapter" pointers under both
      Big Wins + Hot Games field-mapping sections.
    - `docs/07-ai-boundaries.md` — Shared BigQuery Data Source
      section updated to note live adapters now exist + are
      missing-table-tolerant.
    - `docs/bq-shared-schema.md` — "Consumers" block under
      `shared.game_rounds` listing the new adapter modules.
  - Verification captured:
    - `npx tsc --noEmit` clean.
    - Big Wins CLI live run against brand `c77da037-...` with
      `BQ_IMPERSONATE_SA=mkt-agent-bq@mktagent-493404...` —
      `status=missing`, `[big-wins] ... (game_rounds not yet provisioned)`
      log line, normalizer self-check 9/9 assertions passed, exit 0.
    - Hot Games CLI live run against same brand — `status=missing`,
      `[hot-games] ... window=120m (game_rounds not yet provisioned)`,
      self-check 9/9 passed, exit 0.
    - Hot Games invalid-input path — `time_mapping.length=3` vs
      `hot_games_count=4` correctly returned `status=error`,
      `error.code=INVALID_INPUT`, exit 1, no BQ round-trip.
    - `--self-check` only — `npm run big-wins:preview -- brand-x
      --self-check` exit 0 with no BQ auth, confirms shape
      verification runs standalone.
  - What's ready immediately vs waits on live `game_rounds`:
    - Ready now: module shape, typecheck, SQL guardrail coverage,
      `maskUsername()` wiring, frozen-snapshot assembly, input
      validation, missing-table tolerance, admin preview routes,
      CLI verification. AI pipeline can consume the facts today
      against hand-rolled rows.
    - Waits on table: actual row counts, observed payout ratios,
      real dedupe-key column names. Schema reconciliation — re-run
      `npm run bq:smoke`, diff `fixtures/bq-shared-schema.json`,
      adjust `GameRoundRow` / adapter SQL if column names drift.
  - Out of scope (explicit, documented):
    - Phase 5 scheduler driving these on automation-rule cadence.
    - Observed-payout ranking for Hot Games (static RTP for now).
    - Currency lookup from `shared.brands` (adapter accepts arg;
      default `"PHP"`).
    - Final `source_row_key` strategy pending platform `win_id`
      confirmation.
  - No schema migration. No IAM changes. No UI changes.

### 2026-04-22
- Task: Phase 3 — Running Promotions live API adapter
  - Status: Complete
  - Goal: fetch live per-brand promo data from the brand's own API,
    validate defensively, normalize to `PromoFacts[]`, and expose it as
    a drop-in replacement for `promoFixture()` so the existing AI
    pipeline can consume real source data.
  - Files added (`src/lib/promotions/`):
    - `types.ts` — `PromoAdapterResult`, `PromoAdapterErrorCode`
      (`BRAND_NOT_CONFIGURED` / `NETWORK_ERROR` / `HTTP_ERROR` /
      `PARSE_ERROR` / `SCHEMA_ERROR`), `PromoIntegrationConfig`,
      `PromoAdapterSkippedRow`.
    - `load-integration.ts` — Prisma helper reading the three
      integration fields from `Brand.integration_settings_json`;
      returns `null` (treated as `BRAND_NOT_CONFIGURED`) when either
      required field is absent/blank.
    - `client.ts` — `fetchPromotionsRaw(config)`. Stateless native
      `fetch()`, does not interpret status / does not parse JSON /
      does not throw on non-2xx. Sends `X-Brand-Code` when
      `external_brand_code` is configured. URL constructed via
      `new URL(endpoint, base)` so absolute + relative both work.
      Same small-boundary shape as `src/lib/manus/client.ts`.
    - `normalize.ts` — tolerant parser. Accepts both `{data: []}`
      envelope and bare array. Required-for-inclusion fields:
      `id` / `promo_id` / `promoId` (coerced to string) +
      `title` / `name` (trimmed non-empty). Optional fields mapped
      best-effort across common aliases. Malformed rows land in
      `skipped[]` with a reason; batch survives.
    - `adapter.ts` — `fetchPromotionsForBrand(brandId)` orchestrator.
      Never throws on expected conditions; all surface through
      `result.error`. `error` + `promos` not mutually exclusive —
      SCHEMA_ERROR may still ship a subset of valid promos.
      One log line per fetch:
      `[promotions] brand=<id> endpoint=<url> status=<http> count=<N> skipped=<M> err=<code?>`.
  - Verification surfaces:
    - `src/app/api/promotions/fetch-preview/route.ts` — admin dev
      route gated by `ALLOW_ADMIN_PROMO_PREVIEW=true` env + admin
      role (same pattern as `/api/ai/generate-from-fixture`).
    - `scripts/promotions-preview.ts` — CLI script runnable as
      `npm run promotions:preview -- <brand_id>`; prints summary +
      full JSON dump, exit code 1 on any `error` field.
  - Config updates:
    - `package.json` — added `promotions:preview` npm script.
    - `.env.production.example` — documented
      `ALLOW_ADMIN_PROMO_PREVIEW="false"` with rationale.
  - Docs updated:
    - `docs/00-architecture.md` — new "Running Promotions live
      adapter" subsection with module map + verification surfaces +
      AI pipeline hookup snippet; updated AI module-map note that
      promo is now live-sourced; updated source-types list to
      reflect live adapter status.
    - `docs/02-data-model.md` — Brand.integration_settings_json
      bullet expanded with adapter consumption notes.
    - `docs/07-ai-boundaries.md` — new "Running Promotions live
      source" subsection under Shared BigQuery clarifying per-brand
      API (not BQ) source + backend-side validation boundary.
  - Verification captured:
    - `npx tsc --noEmit` clean after a narrowing fix (added
      `kind: "ok"` discriminator to `PromoFetchRawResult` so
      adapter can narrow against the `network_error` sibling).
    - Normalizer self-check with 4 payloads (envelope with good +
      malformed row; bare array with mixed field names + numeric
      id coerced to string; invalid JSON; unknown object shape)
      produced the expected `ok` / `parse_error` / `schema_error`
      branches with the right `promos[]` + `skipped[]` splits.
  - Out of scope here (explicit, documented in plan + docs):
    - Scheduler that calls the adapter on a cadence (Phase 5).
    - Big Wins / Hot Games live adapters (still waiting on
      platform team to provision `shared.game_rounds`).
    - Retry/backoff/cache tuning — upstream reliability unknown;
      add when real traffic justifies it.
    - Schema hardening — tighten `normalize.ts` once platform
      publishes the final contract; `skipped[]` output from early
      production runs will reveal actual shape variance.
  - No schema migration, no IAM changes, no UI changes.



### 2026-04-22
- Task: Production hotfix — revert AI generation to stub until Anthropic credits are active
  - Status: Complete
  - Context:
    - First enabled `AI_PROVIDER=anthropic` on the VM earlier today.
      User clicked Generate Drafts on event "test event" (id
      `cmoa17kvq0000z30lzat1v7gs`, brand `brand_test_01`) — all slots
      failed with `403 "Request not allowed"`. Direct Anthropic API
      ping from the VM also returned 403 on
      `GET /v1/models` (lowest-privilege endpoint). Root cause: the
      Anthropic account is on the free "Evaluation access" plan with
      zero API credits purchased. Anthropic rejects all API calls
      until credits exist.
    - Our app's per-slot try/catch surfaced the error cleanly; no
      drafts were silently stubbed, no drafts were inserted for that
      event slot. Correct failure behavior.
  - What was changed (operational only — no code changes):
    - `/opt/mkt-agent/.env` on the VM:
      - `AI_PROVIDER=anthropic` → **`AI_PROVIDER=stub`**
      - `ANTHROPIC_API_KEY=<key>` — left in place, dormant (code only
        reads it when `AI_PROVIDER=anthropic`)
      - `ANTHROPIC_MODEL=claude-sonnet-4-6` — left in place, dormant
    - `sudo pm2 restart mkt-agent --update-env` ran clean; PM2 pid
      698394, online, Next.js Ready in 258ms.
  - Verification captured:
    - `.env` inspection: `AI_PROVIDER=stub` ✓
    - PM2 status: online, uptime 2m post-restart ✓
    - Dispatcher smoke `POST /api/jobs/dispatch` → 200 + expected
      dry-run payload ✓
    - Recent AI-generator log lines: only pre-rollback entries (old
      403 lines from the Anthropic attempt + older stub runs from
      before Anthropic was ever enabled). **Zero fresh AI activity
      since the rollback restart** → confirms no Anthropic calls in
      the current process.
  - Anthropic support preserved in code:
    - `src/lib/ai/client.ts` provider switch unchanged
    - `src/lib/ai/serialize-prompt.ts`, `src/lib/ai/parse-response.ts`
      still shipped
    - `@anthropic-ai/sdk` still installed
    - Re-enabling is purely an env + PM2 restart — no build, no
      deploy, no code change
  - **Flip-back procedure** (once credits are active — 60 seconds):
    1. SSH to the VM and flip the env line:
       ```
       sudo sed -i 's/^AI_PROVIDER=.*/AI_PROVIDER=anthropic/' /opt/mkt-agent/.env
       ```
    2. Restart PM2 with `--update-env`:
       ```
       sudo pm2 restart mkt-agent --update-env
       ```
    3. Verify credits unlocked (direct Anthropic ping — cheapest
       endpoint, model listing):
       ```
       KEY=$(sudo grep ^ANTHROPIC_API_KEY /opt/mkt-agent/.env | cut -d= -f2-)
       curl -sS -w "\nhttp_code=%{http_code}\n" https://api.anthropic.com/v1/models \
         -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" | head -20
       ```
       - `http_code=200` → proceed; `403 Request not allowed` → credits
         not yet propagated, wait ~1 min + retry
    4. User clicks Generate Drafts on an Event in the UI.
    5. Pull PM2 logs + DB drafts → quality review.
  - Docs updated:
    - `docs/08-deployment.md` — new "AI provider toggle (safe prod
      rollback)" subsection under the operational runbook
    - `docs/07-ai-boundaries.md` — small note clarifying stub is a
      valid prod fallback

### 2026-04-22
- Task: Phase 3 — BQ architecture hardening for game_rounds (not-yet-live table)
  - Status: Complete
  - Files changed:
    - `src/lib/bq/shared-types.ts` (new) — row interfaces + helper:
      - `BrandRow`, `UserRow`, `TransactionRow`, `GameRoundRow`, `GameRow`
      - `BQTimestamp` + `unwrapBQTimestamp()` helper for the `{value: ISO}`
        wrapping the SDK returns by default
      - `SharedRowTypeMap` — literal-union-to-interface lookup for
        generic adapter code that wants to parameterize on table name
      - `GameRoundRow` carries an explicit "⚠ PROVISIONAL — table not
        yet created by platform" banner in its JSDoc
      - `TransactionType` + `TransactionStatus` + `GameRoundStatus`
        string-literal unions from the cheat-sheet enums
    - `scripts/bq-smoke-test.ts` — added `runGuardrailSelfTest()` that
      runs 5 intentionally-malformed queries through `runQuery()`
      (unqualified FROM on each of the 5 shared tables + one
      unqualified JOIN) and asserts each throws the boundary
      `BQ guardrail` error BEFORE hitting BigQuery. Prints
      `✓ guardrail self-test passed (5 checks...)` on success.
      Entire run aborts if any check regresses — catches future
      weakening of `assertQueriesAreQualified` instantly.
    - `docs/bq-shared-schema.md` — Node-SDK example section expanded
      to show typed-row usage (`UserRow`, `GameRoundRow`) + pointer
      to `src/lib/bq/shared-types.ts`. Added explicit note that the
      smoke test exercises the guardrail on every run.
  - What's ready for the game_rounds adapter work when the table lands:
    - `SHARED_TABLES.game_rounds` const (already shipped)
    - `GameRoundRow` interface (new today) — `runQuery<GameRoundRow>(...)`
      gives full compile-time type safety even while the table is
      missing; Big Wins + Hot Games adapters can be written against
      the interface without waiting on platform
    - `GameRoundStatus` enum union — `"pending" | "settled" | "refunded" | "reclaimed"`
    - Smoke test tolerates missing table, reports as platform TODO
    - Fixture records `status: "missing"` so schema-drift check has a
      before-state to compare against when the table ships
    - Guardrail actively rejects unqualified `FROM game_rounds`
      references — regression protection is live today, not later
    - Docs flag the table as provisional + tell operators to re-run
      `npm run bq:smoke` to reconcile once it ships
  - Typecheck clean. No production runtime changes; no IAM changes.
  - Verification: smoke test re-run 2026-04-22 — 5/5 guardrail checks
    passed, 4 live tables still query successfully (brands 5, users
    114, transactions 17, games 4,963), game_rounds gracefully
    reported as missing.

### 2026-04-22
- Task: Phase 3 — Shared BigQuery setup + grant verification + SDK defaults
  - Status: Complete
  - Grant verified end-to-end: ✅ CLI + SDK both pass. 4 of 5 shared
    tables live and readable; `game_rounds` not yet created by platform
    team (documented as a TODO; constant already shipped so adapter
    code can be written ahead of the table landing).
  - Files added:
    - `src/lib/bq/shared-schema.ts` — constants + fully qualified table
      refs (`SHARED_PROJECT`, `SHARED_DATASET`, `BILLING_PROJECT`,
      `SHARED_TABLES`, `SHARED_TABLE_NAMES`)
    - `src/lib/bq/client.ts` — singleton BigQuery client pinned to
      `projectId = "mktagent-493404"`. `runQuery()` wrapper with
      `useLegacySql: false` default + 30s job timeout + **unqualified-
      table guardrail** that throws if SQL references any of the 5
      shared tables without the `newgen-492518.shared.` prefix. Auth
      dual-mode: `BQ_IMPERSONATE_SA` env → impersonate via
      `google-auth-library`'s `Impersonated`; env unset → default ADC
      (prod VM with attached SA).
    - `scripts/bq-smoke-test.ts` — standalone smoke-test runner.
      COUNT + first-row for each of the 5 shared tables, writes
      `fixtures/bq-shared-schema.json` (column lists + trimmed first
      row per table + timestamps). Per-table error isolation so one
      missing table doesn't abort the whole run.
    - `fixtures/bq-shared-schema.json` — committed snapshot:
      brands (5 rows, 9 cols), users (114 rows, 25 cols),
      transactions (17 rows, 13 cols), game_rounds (missing),
      games (4,963 rows, 12 cols). Diff target for future schema-drift
      checks.
    - `docs/bq-shared-schema.md` — cheat sheet with billing rule,
      fully-qualified names, verified example queries (CLI + SDK),
      5-table schema, live-snapshot table, write policy ("blocked at
      IAM level — don't work around it"), schema-change request
      process, auth paths (local vs prod VM).
  - Files modified:
    - `package.json` — `@google-cloud/bigquery ^8.1.1` already present
      (no install). Added `tsx ^4.21.0` as devDep + `npm run bq:smoke`
      script.
    - `.env.production.example` — BQ section rewritten. Correctly
      identifies `newgen-492518` as data-owner + `mktagent-493404` as
      job-runner/billing. Added `BQ_IMPERSONATE_SA` (local dev) +
      documented prod VM "leave unset; attach SA to VM" path.
      Removed misleading legacy placeholders.
  - GCP changes made (not in code):
    - Granted `roles/iam.serviceAccountTokenCreator` on
      `mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com` to
      `user:max@nextstage-ent.com` (enables impersonation for local dev)
    - Enabled `iamcredentials.googleapis.com` API on `mktagent-493404`
      (required for programmatic impersonation via the SDK; `bq` CLI
      used a different code path, which is why CLI worked before this)
  - How SDK defaults prevent billing mistakes:
    - `new BigQuery({ projectId: "mktagent-493404" })` is the ONLY
      construction path in `client.ts`. `BILLING_PROJECT` constant is
      the single source of truth; any query submitted through
      `runQuery()` bills to `mktagent-493404` automatically.
    - Unqualified-table guardrail in `runQuery()`: if any application
      code forgets the `newgen-492518.shared.` prefix on a known
      shared-table reference, the query throws at the boundary with a
      clear error — never hits BigQuery, never bills, can't
      accidentally target a different dataset.
    - `SHARED_TABLES` constants discourage hard-coded strings in
      adapter code. IDE autocomplete picks them up.
  - Where fixture output was saved:
    `c:/Users/moloh/mkt-agent/fixtures/bq-shared-schema.json` (199
    lines, timestamped, committed). Re-run `npm run bq:smoke` to
    refresh; `git diff fixtures/bq-shared-schema.json` surfaces
    schema drift.
  - Docs added:
    - `docs/bq-shared-schema.md` (new — the cheat sheet)
  - Blockers / follow-up items:
    - **`game_rounds` table not yet created by platform team.**
      Required for Big Wins and Hot Games adapters. Until it lands:
      smoke test reports it as `missing` (warning only); constants
      still expose the fully qualified ref so adapter code compiles.
    - **Prod VM auth not yet wired** (deferred per plan). When
      attaching Big Wins / Hot Games adapters: run
      `gcloud compute instances set-service-account mkt-agent-dev
      --zone=asia-east2-c --project=mktagent-493404
      --service-account=mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com
      --scopes=https://www.googleapis.com/auth/cloud-platform` +
      VM restart. Leave `BQ_IMPERSONATE_SA` unset in prod `.env`.
    - **Big Wins BigQuery adapter** — future task. Consumes
      `SHARED_TABLES.users` + `SHARED_TABLES.transactions` +
      `SHARED_TABLES.game_rounds` (when live). Replaces the fixture at
      `src/lib/ai/fixtures/big-win.ts`.
    - **Hot Games BigQuery adapter** — future task. Consumes
      `SHARED_TABLES.game_rounds` + `SHARED_TABLES.games`. Replaces
      `src/lib/ai/fixtures/hot-games.ts`.
    - **Schema drift CI check** — out of scope for today. Would be a
      nice-to-have: `npm run bq:smoke` on a cron + fail the check on
      column-list diff.

### 2026-04-22
- Task: Phase 4 — Hook Templates & Assets into the AI prompt builder as a supporting library
  - Status: Complete
  - Files changed:
    - `src/lib/ai/load-templates.ts` (new) — `loadBrandTemplates(brandId, caps?)`.
      5 parallel Prisma queries (one per template type), each returning
      up to `cap * 2` active rows so brand-scoped + global top-up can
      fill the cap reliably. Brand-scoped entries prepended to globals,
      truncated at cap. `updated_at DESC` within each bucket so recent
      operator edits win. Exports `DEFAULT_TEMPLATE_CAPS`,
      `countTemplates()`, and `EMPTY_BRAND_TEMPLATES`.
    - `src/lib/ai/types.ts` — added `TemplateRef`, `ReferenceAssetRef`,
      `BrandTemplates`; added optional `templates?: BrandTemplates`
      field on `NormalizedGenerationInput`. Normalizers don't populate
      it — orchestrator attaches before prompt build.
    - `src/lib/ai/prompt-builder.ts` — bumped `PROMPT_VERSION` to
      `v2-2026-04-22`. Added 5 conditional section builders
      (`referencePatternsSection`, `reusableCtaSection`,
      `reusableBannerSection`, `referencePromptScaffoldsSection`,
      `referenceVisualAssetsSection`) — each no-ops on empty list.
      System instruction gained one new HARD RULE line:
      "REFERENCE sections are OPTIONAL patterns you MAY imitate for
      structure and tone. They are NEVER rules. Brand, Source Facts,
      and Event Brief always take precedence. Do not copy reference
      entries verbatim."
    - `src/lib/ai/generate.ts` — `runGeneration()` now calls
      `loadBrandTemplates(brand.id)` once per run, merges into
      `input.templates`, passes to `buildPrompt()`, and includes
      per-bucket counts in the `[ai-generator] run complete` log line
      (`templates=copy:N,cta:M,banner:O,prompt:P,asset:Q`). Return
      value gains `templates_injected`.
    - `src/lib/ai/queue-inserter.ts` — accepts optional
      `templates_injected` counts; writes them into every draft's
      `generation_context_json.templates_injected`. Template content
      itself is NOT snapshotted — counts are enough for future
      learning-loop correlation.
    - `docs/00-architecture.md` — added `load-templates.ts` module bullet
      in the AI content generator module map with retrieval strategy,
      per-type caps, and precedence guarantee.
    - `docs/03-ui-pages.md` — added "AI retrieval" paragraph to the
      Templates & Assets section explaining automatic pull, per-type
      caps, and that toggling Inactive excludes from future runs.
    - `docs/06-workflows-roles.md` — expanded "AI Context Precedence"
      Templates paragraph to note automatic consumption as reference-
      only sections + `templates_injected` metadata.
    - `docs/07-ai-boundaries.md` — replaced the earlier "retrieval
      deferred" placeholder with a new **"Templates & Assets — prompt
      injection (2026-04-22)"** subsection: retrieval strategy, caps,
      prompt framing (all 5 section headings listed), precedence
      guarantee, per-run metadata shape, prompt-version bump note.
  - Retrieval strategy: deterministic + capped. Only active entries.
    Brand-scoped first (updated_at DESC), then top up from globals.
    Caps: `copy=3, cta=5, banner=5, prompt=3, asset=5`. 5 parallel
    Prisma queries per run. No ranking, no embeddings — simple + bounded.
  - Template categories now injected into prompts:
    - `copy` → "Reference patterns (optional — imitate structure, don't
      copy verbatim)"
    - `cta` → "Reusable CTA examples (optional — reference for CTA
      style; final CTA must still match Brand's CTA style)"
    - `banner` → "Reusable banner examples (optional — short overlay-
      text patterns)"
    - `prompt` → "Reference prompt scaffolds (optional — structural
      cues for the image_prompt field)"
    - `asset` → "Reference visual assets (optional — mention
      descriptively in image_prompt where relevant; do not fabricate
      URLs)"
    All sections are conditional on non-empty buckets; brands with no
    templates produce prompts identical to the previous build.
  - Precedence preserved:
    - New HARD RULE line in the system instruction explicitly bars
      reference sections from overriding Brand, Source Facts, or Event
      Brief
    - Section headings themselves restate "optional — imitate
      structure, don't copy verbatim" + the precedence guarantee
    - Zod schema + prompt builder unchanged for brand/event/source
      sections; the reference sections are purely additive
  - Event generation now uses Templates & Assets: yes.
    `POST /api/events/[id]/generate-drafts` routes through
    `runGeneration()`, which loads templates for each slot. The
    fixture-based dev route (`POST /api/ai/generate-from-fixture`)
    uses the same pipeline and therefore benefits identically.
  - Metadata additions:
    - `generation_context_json.templates_injected: {copy, cta, banner,
      prompt, asset}` — per-bucket counts, written on every draft
    - Lightweight; no template content snapshot, no URL duplication
    - Ready for Phase 6 learning-loop consumption: correlate "which
      template category(ies) were present" with "draft approved /
      edited / rejected" outcomes
  - Typecheck clean (`npx tsc --noEmit`).
  - Follow-ups (explicit — not in this task):
    - Semantic / vector retrieval (currently deterministic by
      updated_at + brand scoping)
    - Ranking by source_type relevance — template entries don't yet
      carry source_type tags
    - Anthropic prompt caching (`cache_control` on system + brand +
      reference sections — valuable once prod volume grows)
    - Image generation consuming the `asset` URLs as real input
    - Learning loop feeding reuse ↔ outcome correlations back into
      retrieval (Phase 6)

### 2026-04-22
- Task: Phase 4 — Wire real text-generation provider (Anthropic Claude)
  - Status: Complete
  - Files changed:
    - package.json / package-lock.json — added `@anthropic-ai/sdk ^0.90.0`
      as a runtime dependency.
    - src/lib/ai/serialize-prompt.ts (new) — turns the
      provider-agnostic `StructuredPrompt` into the Anthropic Messages
      API's `{ system, user }` pair. Restates the output schema inline
      in the user message with the exact JSON shape + required sample
      count. Exports `ANTHROPIC_JSON_PREFILL = "{"` (the assistant
      pre-fill that nudges Claude to emit JSON from the first token).
    - src/lib/ai/parse-response.ts (new) — `parseGeneratedSamples(raw,
      expectedSampleCount)`. Pulls the first top-level JSON object
      from arbitrary model text using a balanced-brace scan that
      handles pure JSON, markdown-fenced JSON (```json ... ```), and
      prose-wrapping. Validates through a Zod schema mirroring
      `GeneratedSample`. Truncates extras; throws with a clear error
      on schema drift or shortage so the event route's per-slot
      try/catch can surface it to operators.
    - src/lib/ai/client.ts — added `anthropicProvider()` behind a new
      `case "anthropic"` in `generateSamples()`. Reads
      `ANTHROPIC_API_KEY` (required — throws loud if missing) and
      `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`). Single
      `messages.create` call per run with assistant pre-fill of `{`.
      Stitches the pre-fill back onto the response text before
      parsing. Logs per-run: provider, platform, model, input_tokens,
      output_tokens. Stub provider preserved as default.
    - .env.production.example — documented `ANTHROPIC_API_KEY` and
      optional `ANTHROPIC_MODEL` under the existing AI section, with
      explicit "fails loud if key unset" note and model override
      suggestions (haiku for cheaper, opus for richer).
    - docs/00-architecture.md — `client.ts` bullet updated to describe
      the anthropic case + fail-loud semantics; added new
      `serialize-prompt.ts` and `parse-response.ts` module bullets in
      the AI content generator module map.
    - docs/03-ui-pages.md — Events "Generate Drafts" note updated to
      mention `AI_PROVIDER=anthropic` as the path to real AI copy
      (stub remains the safe default).
    - docs/07-ai-boundaries.md — new **"AI generator — real provider
      (Anthropic Claude)"** subsection covering activation, fields
      generated, request shape, response parsing, preserved
      precedence, and explicit deferrals (prompt caching,
      image-generation, tool-use).
  - Provider wired: **Anthropic Claude** via `@anthropic-ai/sdk`.
    Chosen because it matches the stub's existing `AI_PROVIDER=anthropic`
    hint, the project's Claude-native tooling + docs, and gives reliable
    JSON output via the assistant-pre-fill technique.
  - Env vars added:
    - `ANTHROPIC_API_KEY` — required when `AI_PROVIDER=anthropic`;
      unset key throws a clear error at call time (no silent stub
      fallback, so misconfig surfaces during rollout)
    - `ANTHROPIC_MODEL` — optional; defaults to `claude-sonnet-4-6`
      (balanced quality/cost); override for haiku or opus
  - Fields now generated by the real provider:
    - `headline` — short punchy hook
    - `caption` — full post copy, platform-appropriate length
    - `cta` — call-to-action matching brand's CTA style
    - `banner_text` — optional short overlay text (or `null` when not
      applicable)
    - `image_prompt` — one-paragraph visual direction for a future
      image-generation step
  - Events now use real AI output: yes —
    `POST /api/events/[id]/generate-drafts` is the first-class path.
    Each (occurrence × platform) slot runs through the provider when
    `AI_PROVIDER=anthropic`. Fixture-based generation via
    `POST /api/ai/generate-from-fixture` (dev-only; gated by
    `ALLOW_AI_FIXTURES=true`) uses the same provider path, so operators
    can test real-provider output against bundled fixtures before
    wiring live sources.
  - Preserved invariants:
    - Brand Management base + Event brief override precedence unchanged
      (same `StructuredPrompt`, same prompt builder)
    - Sample count + grouping + `generation_context_json` snapshot
      unchanged
    - Refine constraints unchanged (Hot Games frozen snapshot, event
      rules locked, no-refine-after-approval policy)
    - Stub remains the default provider — prod must explicitly opt in
      to real generation
  - Remains deferred (not in this task, intentional):
    - **Image generation** — the `image_prompt` is text only; no image
      model is locked, no image files are rendered. Future phase.
    - **Prompt caching** (Anthropic `cache_control` on the system
      prompt + brand-context sections). Worth adding once there's
      production volume for the same brand; skipped now to avoid
      overengineering the first wire-up.
    - **Tool-use / structured-output mode**. The pre-fill + Zod combo
      is reliable enough for current output shape.
    - **Live BigQuery + Promotions API adapters** (Phase 3).
    - **Templates & Assets retrieval hook-up into the prompt builder**
      (Phase 4 continuation).
    - **Learning loop** (Phase 6).
  - Typecheck clean (`npx tsc --noEmit`). SDK v0.90.0 pulls three new
    packages; no breaking peer-dep changes.

### 2026-04-22
- Task: Phase 1 / 7 — Templates & Assets audit: reposition as reusable library (not base AI rules)
  - Status: Complete
  - Product rule locked:
    - Brand Management = base AI rules
    - Event brief = situational override/input
    - **Templates & Assets = reusable supporting library** for operators
      and the future AI content generator. Not a rule layer; never
      overrides brand or event context.
  - Files changed (no DB migration; enum values in `TemplateType` and
    `AssetType` are unchanged):
    - src/lib/validations/template.ts:
      - Added AI-aware labels to `TEMPLATE_TYPE_LABELS`
        (caption → "Copy Template", banner → "Banner Text Pattern",
        prompt → "Prompt Template", cta → "CTA Snippet",
        asset → "Reference Asset")
      - Added `TEMPLATE_TYPE_LABELS_PLURAL` for tab headers /
        empty-states
      - Added `TEMPLATE_TYPE_HELPERS` per-type guidance strings
        emphasizing "reusable library" role and (for `asset`)
        distinction from Brand Management's `benchmark_assets`
      - Added `TEMPLATE_TAB_ORDER` — canonical tab order (caption → cta
        → banner → prompt → asset) matching the target IA
      - Tightened `textTemplateConfigSchema.content` to `.trim().min(1)`
        so empty strings can't silently persist (UI already blocked;
        schema now agrees)
      - Trimmed other inputs (`name`, `notes`, `url`) for hygiene
      - Added a module-role docblock at the top of the file so future
        readers understand precedence before editing
    - src/app/(app)/templates/page.tsx:
      - Header description rewritten to emphasize library role and
        "operators and the AI content generator draw from these as
        supporting material"
      - New inline callout under the header: "Not base AI rules —
        positioning, tone, language, audience, banned topics, and
        brand notes live in **Brand Management**. Event briefs remain
        the situational override. This page is a reusable supporting
        library."
      - Tabs now read from `TEMPLATE_TAB_ORDER` (Copy → CTA → Banner →
        Prompt → Assets) using plural labels
      - Per-tab helper text rendered above each section and echoed in
        the create/edit dialog (reused `TEMPLATE_TYPE_HELPERS`)
      - Concrete token-style placeholders per tab (e.g.
        `{player_handle}`, `{win_amount}`, `{brand}`) so operators
        immediately understand "pattern, not exact wording"
      - Dialog labels made type-specific ("Prompt scaffold" /
        "CTA line" / "Pattern") instead of a generic "Content"
      - Notes label reframed as "Usage notes" with per-tab "when to
        use this" placeholders
      - Active toggle annotated: "inactive entries are hidden from AI
        reuse"
      - Reference Asset dialog notes storage caveat: "File hosting is
        not wired in this build — paste a publicly hosted URL"
      - Tab bar now scrolls on narrow viewports (`overflow-x-auto`)
    - docs/03-ui-pages.md — Templates & Assets section rewritten from
      a one-liner into a full subsection: reusable-library positioning,
      relationship to Brand Management + Event, new tab ordering,
      per-tab descriptions, distinction between Reference Assets and
      Brand Management benchmark assets, global vs brand-scoped rules.
    - docs/06-workflows-roles.md — "AI Context Precedence" section
      gets a new paragraph explicitly placing Templates & Assets as a
      reusable supporting layer that does NOT override brand/event rule
      layers. Lists the 5 template types + their intended use.
    - docs/07-ai-boundaries.md — Input Contract gets a new
      "Templates & Assets — reusable supporting library" subsection
      mapping DB enum values to operator labels and making clear the
      retrieval call is not wired in Phase 4 (library is ready; hook-up
      lands with the real AI provider).
  - What overlap with Brand Management was removed or clarified:
    - `asset` vs `benchmark_assets` overlap clarified in UI copy + all
      three docs: benchmark_assets are brand-identity base guidance;
      Templates' reference assets are operational library material
    - `caption` vs Brand's `sample_captions` overlap clarified by
      renaming tab to "Copy Templates" and reframing helper text as
      "pattern, not exact wording" (sample_captions = few-shot voice
      examples; copy templates = structural scaffolds)
    - Inline callout on the page + module-role docblock prevent future
      drift
  - Final role of Templates & Assets:
    - Reusable supporting library of copy patterns, CTA snippets,
      banner text patterns, prompt templates, and reference assets
    - Drawn from by operators + the future AI content generator as
      building blocks
    - **Not** a rule source. Cannot override Brand or Event context.
  - Tab / field / placeholder changes:
    - Tab order: caption → banner → prompt → cta → asset ⇒ caption →
      cta → banner → prompt → asset
    - Tab labels: "Captions / Banner Text / Image Prompts / CTA
      Snippets / Assets" ⇒ "Copy Templates / CTA Snippets / Banner
      Text Patterns / Prompt Templates / Reference Assets"
    - Dialog content labels: generic "Content" ⇒ per-type ("Prompt
      scaffold" / "CTA line" / "Pattern")
    - Placeholders: abstract examples ⇒ concrete token-style patterns
      (e.g. `{win_amount}`, `{brand}`, `{player_handle}`)
  - Validation changes: `content` min(1) at the Zod level; trims on
    name / content / notes / url
  - Docs updated: docs/03-ui-pages.md (section rewrite), docs/06
    (AI Context Precedence addition), docs/07 (new supporting-library
    subsection). docs/02-data-model.md unchanged — no schema change.
  - Typecheck clean (`npx tsc --noEmit`). No DB migration.
  - Follow-ups deferred:
    - AI generator retrieval hook-up (Phase 4 continuation): prompt
      builder will pull active brand-scoped templates by `template_type`
      and append them as additional prompt sections. Trivial to add
      once the live provider is chosen.
    - Optional: an admin seed set of global (brand_id=null) templates
      to bootstrap new brands.

### 2026-04-21
- Task: Phase 4 — AI content generator agent foundation
  - Status: Complete
  - Files changed (all new under `src/lib/ai/` unless noted):
    - `types.ts` — canonical shapes: `BrandContext`, `EventOverride`,
      `EffectiveContext`, `SourceFacts` (discriminated union for
      big_win / promo / hot_games / event / educational),
      `NormalizedGenerationInput`, `GeneratedSample`,
      `GenerationRunResult`.
    - `resolve-context.ts` — `resolveEffectiveContext(brand, event?)`
      merges Brand base + Event override into the single context the
      prompt builder reads. Brand positioning never overridden;
      `notes_for_ai` appended (not replaced) when both layers have it;
      `overridden_by_event[]` recorded for transparency.
    - `source-normalizers/{index,defaults,big-win,promo,hot-games,event,educational}.ts`
      — one normalizer per source_type. Each lifts raw per-source facts
      (plus brand + optional event) into `NormalizedGenerationInput`.
      Sample count defaults: big_win=3, promo=3, hot_games=2, event=1,
      educational=2.
    - `fixtures/{index,big-win,promo,hot-games,educational}.ts` — mock
      source payloads shaped exactly like what the future BigQuery /
      Promotions API adapters will emit, so swapping in live data is a
      one-call change in the orchestrator.
    - `prompt-builder.ts` — builds a structured multi-section prompt:
      brand positioning, voice & tone, audience, language style (+
      sample), brand notes, restrictions (banned phrases + topics),
      default hashtags, few-shot sample captions (up to 5), platform
      guidance, source facts, optional event override section
      surfacing which fields the event overrode. Strict-JSON output
      schema. Versioned via `PROMPT_VERSION = "v1-2026-04-21"`.
    - `client.ts` — swappable provider boundary. Current state:
      `AI_PROVIDER=stub` (default) returns deterministic placeholder
      samples shaped like a real provider response — the whole
      pipeline runs end-to-end with no provider account and no cost.
      Future Anthropic / OpenAI wire-up is a single-case addition to
      the `switch(provider)` in `generateSamples()`. Emits
      `[ai-generator]` log line per run.
    - `queue-inserter.ts` — `insertSamplesAsDrafts()`. Writes one Post
      per sample as `draft` status. Every draft carries:
      `generation_context_json.{sample_group_id, sample_index,
      sample_total, source_type, source_snapshot, prompt_version,
      ai_provider, ai_dry_run, generated_at, effective_context_overrides}`.
      Hot Games drafts additionally get `type: "hot_games_snapshot"`
      + `ranked_games` so the existing refine modal's Hot Games contract
      keeps working. Uses `$transaction` over `create` calls so we can
      collect created ids (createMany doesn't return them).
    - `generate.ts` — `runGeneration({ input, created_by })`
      orchestrator: build prompt → call client → insert drafts →
      return `{ created_post_ids, sample_count, dry_run, provider,
      prompt_version }`. Single entry point; per-source routes only
      produce `NormalizedGenerationInput`, never touch prompt/client/DB
      directly. Re-exports helper namespaces `normalizers` and
      `fixtures` for API-route ergonomics.
    - `load-brand.ts` — server helper `loadBrandContext(brandId)` /
      `brandOr404(brandId)`. Pulls a Brand row and coerces
      voice/design/sample_captions JSON blobs into the `BrandContext`
      shape. Mirrors the client-side coercions in the brands page.
    - `src/app/api/ai/generate-from-fixture/route.ts` (new) — admin-only
      dev endpoint gated by `ALLOW_AI_FIXTURES=true`. Body
      `{ source_type, brand_id, platform?, sample_count? }`, runs
      pipeline against bundled fixture. Returns
      `{ created_post_ids, sample_group_id, ... }`. Events not
      supported here — they have their own route.
    - `src/app/api/events/[id]/generate-drafts/route.ts` (modified) —
      upgraded from "create empty shell posts" to "run AI pipeline per
      (occurrence × platform) slot". Dedupe on
      `(source_instance_key, platform)` preserved. Default 1 sample
      per slot (matches legacy); accepts `?samples_per_slot=N` (1–5).
      Builds `EventOverride` including `posting_instance_summary` so
      the prompt's event section can reference the cadence.
    - `prisma/schema.prisma` + `prisma/migrations/20260421230000_ai_sourcetype_educational/migration.sql`
      — added `educational` to `SourceType` enum. Matches `PostType`
      which already had it. Required so AI-generated educational drafts
      persist with the correct source label. One-line `ALTER TYPE ...
      ADD VALUE IF NOT EXISTS 'educational'` migration.
    - `.env.production.example` — added `AI_PROVIDER="stub"` and
      `ALLOW_AI_FIXTURES="false"` with comments describing swap path
      and dev-endpoint gate.
    - `docs/00-architecture.md` — new "AI content generator" subsection
      covering the pipeline diagram, module map, precedence rule,
      supported source types, image-generation deferral note, dev +
      event entry points, refine compatibility.
    - `docs/02-data-model.md` — added `source_type` enum listing with
      the new `educational` value + date note.
    - `docs/03-ui-pages.md` — Events detail page note updated: the
      "Generate Drafts" button now runs through the AI pipeline (not
      shell posts) + `?samples_per_slot` tunable.
    - `docs/07-ai-boundaries.md` — Input Contract paragraph now
      references `NormalizedGenerationInput` + `resolveEffectiveContext`.
      Multi-sample Draft Grouping list now includes Events + Educational
      counts and names `defaultSampleCount()`.
  - Generation architecture created:
    - 5-stage pipeline: normalizer → prompt builder → provider client →
      queue inserter → Content Queue draft rows
    - Orchestrator `runGeneration()` is the single entry point from API
      routes; per-source routes only produce `NormalizedGenerationInput`
    - Provider boundary sits behind an env flag; stub runs by default
    - Image generation explicitly deferred (image_prompt emitted but
      not rendered; no model locked)
  - Normalized input shape (`NormalizedGenerationInput`):
    - `source_type` + `source_id` + `source_instance_key` (correlation)
    - `brand: BrandContext` + `event: EventOverride | null` (raw layers
      for audit/snapshot)
    - `effective: EffectiveContext` (merged, prompt-builder consumes
      this)
    - `source_facts: SourceFacts` (discriminated union)
    - `post_type` + `platform` + `sample_count` + `sample_group_id`
  - Precedence model used: **Brand Management (base) → Event brief
    (override on conflict)**. Brand positioning never overridden;
    tone/cta/audience/notes_for_ai can be overridden by event; event
    notes are appended to brand notes (not replaced). Overridden fields
    tracked in `effective.overridden_by_event[]` and surfaced in the
    prompt's Event Brief section.
  - Source types supported (Phase 4 MVP):
    - big_win (3 samples; fixture-backed)
    - promo (3 samples; fixture-backed)
    - hot_games (2 samples; fixture-backed)
    - event (1 sample per slot; live — uses real Event rows)
    - educational (2 samples; fixture-backed)
  - How samples are generated into Content Queue:
    1. Normalizer produces `NormalizedGenerationInput` (assigns
       `sample_group_id`)
    2. `buildPrompt(input)` returns a `StructuredPrompt` with labeled
       sections + strict JSON output schema
    3. `generateSamples({ input, prompt })` returns `{ samples[],
       provider, dry_run }` — stub in default config, swappable later
    4. `insertSamplesAsDrafts(...)` writes one `draft` Post per sample
       with the shared `sample_group_id` + `sample_index`/`sample_total`
       in `generation_context_json` (picked up by the existing Queue
       enrichment logic that renders "Sample N/M" chips)
    5. Drafts enter the normal review lifecycle: refine/approve/schedule/publish
  - Mock fixtures: `bigWinFixture()`, `promoFixture()`,
    `hotGamesFixture()`, `educationalFixture()` in `src/lib/ai/fixtures/`.
    Each accepts partial overrides for targeted test runs.
  - Actual AI generation implemented vs deferred:
    - **Implemented**: full prompt builder, provider boundary, dry-run
      stub that returns deterministic placeholder samples, queue insertion
      with full context snapshot, event route using the pipeline end-to-end
    - **Deferred** (single-function flip each, behind env):
      Anthropic/OpenAI provider, actual image rendering, learning
      loop, live BigQuery and Promotions API adapters (fixtures stand in
      for now)
  - Refine-flow compatibility: confirmed. Hot Games drafts still get
    the `type: "hot_games_snapshot"` tag + frozen ranked_games, so the
    existing refine modal's Locked Context panel continues to render
    correctly. Event-derived drafts carry the event id as `source_id`
    and occurrence ISO as `source_instance_key`, so existing event
    context resolution still works.
  - Typecheck clean (`npx tsc --noEmit`), Prisma client regenerated.
  - Follow-ups (not blocking Phase 4 close):
    - Phase 3: live BigQuery adapter for big_win + hot_games;
      per-brand Promotions API adapter. Drops into the existing
      normalizer inputs with zero downstream changes.
    - Provider wire-up (Anthropic / OpenAI). Single-case addition in
      `client.ts`; no other files need to change.
    - Image-generation provider decision + wire-up.
    - Phase 6: learning loop reads the rich
      `generation_context_json` snapshot already being written by
      every draft.

### 2026-04-21
- Task: Ops cleanup — standardize deploy ownership on root
  - Status: Complete
  - Commit: `29e5bd2` on origin/master
  - Problem fixed: `/opt/mkt-agent` was owned by `max:max` but PM2 god
    daemon runs as root, so `sudo bash scripts/deploy.sh` tripped git's
    `detected dubious ownership` guard. Deploys previously worked only via
    a `sudo -u max bash -c '...'` hack.
  - Recommended final ownership model:
    - `/opt/mkt-agent` → `root:root`
    - `/opt/mkt-agent/.env` → `root:root` with mode `600`
    - PM2 god daemon stays under root (unchanged)
    - `/var/log/mkt-agent` stays under root (unchanged)
  - Exact server commands run (one-time, all idempotent):
    1. `sudo chown -R root:root /opt/mkt-agent`
    2. `sudo chmod 600 /opt/mkt-agent/.env`
    3. `sudo pkill -f "/home/max/.pm2"` (then targeted `sudo kill 515800`
       for the moloh daemon pkill didn't catch)
    4. `sudo pm2 status` — confirmed `mkt-agent` online under root
  - scripts/deploy.sh changes:
    - **Root guard** at the top: exits with `"ERROR: deploy.sh must be run
      as root …"` and points at docs/08-deployment.md if run without sudo
    - **Idempotent ownership self-heal**: `chown -R root:root $APP_DIR`
      runs before `git pull` if the tree ever drifts back to a non-root
      owner (self-healing for future VMs)
    - Dropped redundant `sudo` prefix on `fuser` (guard guarantees root)
    - Updated Usage comment to canonical
      `sudo bash /opt/mkt-agent/scripts/deploy.sh`
    - Added inline reference to "docs/08-deployment.md — Deploy ownership
      model" for future operators
  - docs/08-deployment.md changes:
    - New **"Deploy ownership model"** subsection directly under
      "Production target" covering:
      - Plain statement of the model ("everything runs as root") + why
      - Canonical-commands table (deploy / logs / restart / status)
      - One-time cleanup block (four `sudo` commands) for VMs that have
        drifted to non-root ownership
    - Removed the now-redundant "Operational note" paragraph from the
      Cloud Scheduler section (content superseded by the new subsection)
    - Small wording tweak in Production target to clarify deploy script
      is run "as root"
  - Verification performed end-to-end:
    - `ls -ld /opt/mkt-agent` → `drwxr-xr-x root root` ✓
    - `stat /opt/mkt-agent/.env` → `root root 600` ✓
    - PM2 daemons — only root's remains (`/root/.pm2`); max's + moloh's
      user-scoped daemons killed ✓
    - `sudo bash /opt/mkt-agent/scripts/deploy.sh` — all 6 steps succeed,
      PM2 restart output shows `user=root` ✓
    - `bash /opt/mkt-agent/scripts/deploy.sh` (no sudo) → exits with
      `ERROR: deploy.sh must be run as root …` + exit code 1 ✓
    - Post-deploy curl smoke test against `/api/jobs/dispatch` → 200
      with expected dry-run payload ✓
    - Cloud Scheduler still firing every 2 min (unchanged from before) ✓
  - Summary: deploy flow is now a single `sudo bash
    /opt/mkt-agent/scripts/deploy.sh` — no `sudo -u max` workaround, no
    git dubious-ownership, self-healing against future drift. Docs reflect
    the correct operational model.

### 2026-04-21
- Task: Phase 1 — Refactor Brand Management as the base AI profile for each brand
  - Status: Complete
  - Product rule locked: Brand Management = default/base AI instruction
    layer. Adhoc Event brief overrides brand rules on conflict.
  - Files changed:
    - src/lib/validations/brand.ts — schema overhaul:
      - **Identity**: `name` + `domain` required; hex colors required; `logo_url`
        removed (logos moved to design). Brand Positioning lives in voice (see
        below).
      - **Voice**: new required fields — `positioning` (50–200 chars), `tone`,
        `cta_style`, `emoji_level`, `language_style` (free text, replaces old
        enum), `language_style_sample`, `audience_persona`, `notes_for_ai`.
        Legacy `taglish_ratio` enum + LANGUAGE_STYLES / TAGLISH_RATIOS constants
        removed. Added `banned_topics` (sibling to banned_phrases).
      - **Design**: dropped `.or(z.literal(""))` fallbacks (empty strings no
        longer silently stored). Added `logos: { main, square, horizontal,
        vertical }` + `benchmark_assets: BenchmarkAsset[]`.
      - **Sample Captions**: `title` + `text` now required.
    - src/lib/brands-api.ts — updated Brand type (added legacy `logo_url`
      pass-through field), BrandIdentityInput, BrandCreateInput (voice
      required on create), BrandUpdateInput.
    - src/app/api/brands/route.ts — POST creates with `domain` non-null and
      `logo_url: null` explicitly (legacy column cleared on new brands).
    - src/app/api/brands/[id]/route.ts — PATCH no longer writes top-level
      `logo_url` column (logos now in design_settings_json).
    - src/components/brands/brand-multiselect.tsx (new) — DropdownMenu-based
      multi-select with CheckboxItem rows. "All Brands" row clears selection;
      default empty array means "no filter applied".
    - src/components/brands/logo-upload-zone.tsx (new) — drag-drop + click
      upload slot with client-side validation (PNG, ≥500×500, ≤5 MB via
      FileReader + Image decode). Preview is client-memory only; a URL text
      input beside each zone is what actually persists (storage not wired
      yet). Also exports `LOGO_SLOTS` (the 4 slot definitions) and
      `LogoUploadConstraints` (shared callout).
    - src/components/brands/benchmark-assets.tsx (new) — repeater of
      benchmark/reference images with per-card drag-drop preview + URL
      persistence. Same storage caveat as logos.
    - src/app/(app)/brands/page.tsx — full refactor (page + dialog):
      - Main-page filters: search + Status select ("Status: All / Active /
        Inactive") + Brand multi-select (default "All Brands", client-side
        filter on already-fetched list)
      - Card: now shows positioning preview under brand name (truncated 2 lines)
      - Dialog: AI-precedence callout at the top ("These settings form the
        base AI profile for this brand. Adhoc Event briefs override brand
        rules on conflict.")
      - Identity tab: name, domain, Brand Positioning Statement (50–200 chars
        with live counter), 4 logo slots, 3 colors with helper, active toggle
      - Integration tab: BigQuery Details callout (shared global source —
        only External Brand ID + Source Mapping Notes) + API Details (API Base
        URL, Promo List Endpoint, Tracking Link Base)
      - Voice & Tone tab: Tone / CTA Style / Emoji Level (dropdowns, compact
        row) + Language Style (free text) + Language Style Sample + Audience
        Persona + Notes for AI + Banned Phrases + Banned Topics + Default
        Hashtags (all with concrete placeholders)
      - Design tab: 6 design notes + Benchmark Assets repeater
      - Captions tab: title+text required, per-card Clone button
      - Save validates + jumps to the offending tab on error
  - Main-page filter changes:
    - Search input (pre-existing, unchanged)
    - Status dropdown — labels now "Status: All" / "Status: Active" /
      "Status: Inactive" (operators immediately recognize it as the status filter)
    - Brand multi-select dropdown — new; default "All Brands"; multi-select
      narrows visible cards client-side
    - Card count footer now reads "Showing N of M brands" when filtering
  - Identity / Integration / Voice / Design / Sample-Caption changes — see
    Files changed above.
  - Required fields enforced on save (UI validation jumps to tab):
    - Brand Name, Domain
    - Brand Positioning Statement (50–200 chars)
    - Primary / Secondary / Accent Color (hex format)
    - Tone, CTA Style, Emoji Level
    - Language Style, Language Style Sample
    - Audience Persona, Notes for AI
    - Sample Captions: title + text required per entry (only when a caption
      is added)
    - Logo uploads stay **optional** — storage backend isn't wired, so we
      don't block save on unconfigured URL fields.
  - Upload behavior — implemented vs placeholder:
    - **Implemented now**: drag-drop + click-to-select file picker, full
      client-side PNG/dim/size validation, in-memory preview via FileReader,
      URL text input fallback that actually persists. Helper callouts on both
      Identity tab and Benchmark Assets section state the interim state
      ("Direct upload storage is not yet wired — paste a hosted URL to
      persist. Preview images are client-side only.")
    - **Placeholder / future**: actual object-store upload endpoint
      (S3/GCS/R2). When it lands, the URL fallback input can be hidden
      without any schema change — `design.logos.*` and
      `design.benchmark_assets[].url` are already the persistence targets.
  - Backward compatibility:
    - `coerceVoice` reads legacy rows tolerantly (`language_style` enum values
      become free-text; `taglish_ratio` ignored; positioning + new fields
      start empty and prompt the operator to fill them on first edit)
    - `coerceDesign` surfaces the legacy top-level `logo_url` column as
      `design.logos.main` on form load if that slot is empty (one-way
      migration — overwritten on next save)
    - `coerceIntegration` maps legacy `notes` → `source_mapping_notes`;
      dropped endpoint fields (`big_win_endpoint`, `hot_games_endpoint`)
      are silently omitted on save
  - AI precedence rule: documented in docs/06-workflows-roles.md (new "AI
    Context Precedence" section above Approval Rules) and docs/07-ai-boundaries.md
    (Input Contract expanded with base → override layer model). Brand is the
    base layer; Event overrides on conflict for event-derived posts.
  - Docs updated: docs/02-data-model.md (Brand fields rewritten to match new
    JSON shapes + legacy notes), docs/03-ui-pages.md (Brand Management section
    rewritten to match new tabs + filters + upload caveat), docs/06-workflows-roles.md
    (AI Context Precedence section added), docs/07-ai-boundaries.md (Input
    Contract layered model).
  - Typecheck clean (`npx tsc --noEmit`).
  - Follow-ups deferred to later tasks:
    - Actual file upload backend for logos + benchmark assets (S3/GCS/R2 +
      POST /api/uploads endpoint + drag-drop wiring)
    - Phase 4: wire the Brand Management JSON into the AI prompt builder
      (Brand → base layer, Event → override layer)

### 2026-04-21

### 2026-04-21
- Task: Phase 2 — Finalize Manus external response protocol
  - Status: Complete
  - Scope: lock contract shapes + error taxonomy; tighten types, schema,
    and docs so the dispatcher → Manus → callback loop has zero ambiguity.
    No behavioral changes.
  - Files changed:
    - src/lib/manus/types.ts — added:
      - `ManusErrorCode` string union (8 canonical classes)
      - `error_code?: ManusErrorCode` on `ManusDispatchResult`
      - New `ManusCallbackPayload` interface mirroring the Zod schema at
        the callback route (for server-side callers + test harnesses)
      - Expanded JSDoc on all four exported types spelling out the
        contract pointers to docs/00-architecture.md
    - src/lib/manus/client.ts — refactored response parsing to read
      `{ external_ref?, error?, error_code? }` from Manus's body on both
      2xx (accept path) and non-2xx (reject path). Network errors now map
      to `error_code: "NETWORK_ERROR"`. Doc comment updated to reflect
      finalized contract.
    - src/lib/manus/dispatcher.ts — log line now includes `external_ref`
      on accepted dispatches and `code=<ManusErrorCode>` on failed handoffs.
    - src/app/api/manus/callback/route.ts:
      - Zod schema accepts `error_code?: z.string()` and
        `external_ref?: z.string()` — intentionally plain strings, not
        Zod-enums, so unknown codes don't reject the callback (forward compat)
      - New `formatLastError(message, code)` helper produces
        `"[CODE] message"` when code is present, `"message"` otherwise,
        `"Unknown error"` as fallback
      - Full-failure branch uses the formatter
      - Idempotent-failed branch now preserves stored `last_error` when
        Manus re-sends a callback with no error info (fixed: previously
        could clobber stored last_error with null in that edge case)
      - Callback log line appends `error_code=<C>` and `external_ref=<R>`
        when provided
    - docs/00-architecture.md:
      - Callback "Contract" bullet updated to include `error_code` +
        `external_ref` with the forward-compat note
      - Full failure update rule now documents the `[CODE] message` format
      - New "Manus protocol — finalized contract" subsection covering:
        dispatch response shape, callback payload shape, correlation keys
        (delivery_id primary; external_ref Manus-side; external_post_id
        platform-side), full error taxonomy listing, last_error storage
        convention, idempotency expectations, out-of-scope items
    - docs/02-data-model.md — `post_platform_deliveries` entry documents
      the `[CODE] message` format for `last_error` and the explicit
      non-persistence of `external_ref` in MVP
    - docs/06-workflows-roles.md — approval flow step 6 notes that failed
      callbacks may carry `error_code` and how it's stored
    - ROADMAP.md — Phase 2 items 1–8 all marked done with date references;
      added a "Phase 2 status: all items resolved" closing line with note
      that the remaining go-live work (wiring real `MANUS_AGENT_ENDPOINT`,
      HTTPS upgrade) is operational, not product scope
  - Final dispatch response shape (`ManusDispatchResult`):
    ```
    { accepted: boolean,
      dry_run: boolean,
      external_ref?: string,   // Manus-side job reference (optional, on accept)
      error?: string,          // human-readable, on reject
      error_code?: ManusErrorCode }  // machine-readable class, on reject
    ```
  - Final callback payload shape (`ManusCallbackPayload`):
    ```
    { delivery_id: string,           // REQUIRED primary correlation key
      post_id?: string,              // validated cross-check
      platform?: Platform,           // validated cross-check
      outcome: "posted" | "failed",  // REQUIRED
      external_post_id?: string,     // posted — platform-side id
      error?: string,                // failed — human-readable
      error_code?: string,           // failed — machine-readable (ManusErrorCode)
      external_ref?: string,         // pass-through log correlation
      attempted_at?: string }        // ISO datetime, defaults to server now()
    ```
  - `external_ref` convention:
    - Manus-side job reference, returned by Manus on the dispatch response
      and optionally echoed in the callback
    - Distinct from `external_post_id` (platform-side post identifier set
      on successful posted callback)
    - Currently flows through the dispatcher log and callback log only;
      NOT persisted to `post_platform_deliveries` in MVP. Explicit future
      gap: add a column when Manus goes live and cross-system correlation
      becomes operationally necessary
  - Error taxonomy chosen (`ManusErrorCode` union in `src/lib/manus/types.ts`):
    AUTH_ERROR, NETWORK_ERROR, PLATFORM_REJECTED, RATE_LIMITED,
    INVALID_PAYLOAD, MEDIA_ERROR, TEMPORARY_UPSTREAM_ERROR, UNKNOWN_ERROR.
    Codes outside the canonical set are accepted without rejection —
    forward compatibility.
  - Code/type adjustments summary:
    - types.ts: new union + new interface + expanded JSDocs (no renames)
    - client.ts: unified body parsing across 2xx/non-2xx; network errors
      tagged `NETWORK_ERROR`
    - dispatcher.ts: log-line enrichment only (no logic change)
    - callback/route.ts: two new optional fields + last_error formatter +
      fix for edge case (empty repeat-failed callback preserving stored error)
  - Docs updated: 00-architecture.md (major), 02-data-model.md (minor),
    06-workflows-roles.md (minor). 03-ui-pages.md + 07-ai-boundaries.md
    unchanged — current wording stays correct.
  - **Phase 2 status:** all 10 ROADMAP items resolved (8 implemented, 2
    decided/deferred as policy). Remaining "go-live" operational work
    (real Manus endpoint, secret rotation, HTTPS upgrade) is tracked in
    docs/08-deployment.md and is not Phase 2 product scope.

- Task: Phase 2 — Lock in MVP policy: NO REFINE AFTER APPROVAL
  - Status: Complete
  - Policy locked:
    - Refine allowed ONLY in review-side statuses: `draft`, `pending_approval`,
      `rejected`
    - Refine FORBIDDEN in delivery-side statuses: `scheduled`, `publishing`,
      `posted`, `partial`, `failed`. (Approved is metadata-only and not editable.)
    - No Return to Review flow in MVP — approved posts cannot be sent back
      to review. Operator recourse on a post-approval mistake: let delivery
      complete and create a new post
    - Approved-payload snapshot **deferred** because content is locked after
      approval — the dispatcher safely reads live Post fields at dispatch time
      and on retry. Revisit only if the no-refine-after-approval policy is
      ever reversed
    - Retry reuses the same approved content (already implemented)
  - Files changed:
    - src/components/posts/edit-post-modal.tsx — defense-in-depth lockout.
      Added `REFINE_ALLOWED_STATUSES = {draft, pending_approval, rejected}`
      constant and a top-of-render guard: when opened for a non-allowed
      status the modal renders a locked explainer panel instead of the
      refinement form. Copy: "Approved posts cannot be refined in MVP.
      Refinement is available only while a post is in Draft, Pending
      Approval, or Rejected." Current status shown inline so the operator
      understands why.
    - docs/00-architecture.md — new paragraph under the Manus publishing
      section explicitly stating the MVP policy, the allowed vs forbidden
      status sets, and the architectural consequence: approved-payload
      snapshotting is not required under this policy.
    - docs/03-ui-pages.md — Refine modal description now names the allowed
      statuses explicitly, notes row-level button gating, and notes the
      modal-level defensive lockout.
    - docs/06-workflows-roles.md — Refinement section expanded with a
      "Refinement scope — MVP policy (locked 2026-04-21)" block covering
      the rule, the explicit no-Return-to-Review stance, and the snapshot
      deferral rationale.
    - docs/07-ai-boundaries.md — Content Queue Refinement Constraints
      preface adds the allowed-statuses rule, no-Return-to-Review note, and
      confirms the AI layer is never re-entered for approved content.
    - ROADMAP.md — Phase 2 items 9 and 10 struck through and annotated:
      item 9 resolved (NO), item 10 deferred under the locked policy.
  - Where refine is now blocked (defense-in-depth):
    1. Queue page row-level — Refine button hidden unless status ∈
       `EDITABLE_STATUSES = {draft, pending_approval, rejected}`
       (pre-existing; verified correct during audit)
    2. Post detail page inline Edit — `canEditStatus` restricts to
       `{draft, rejected}` (stricter than modal; compliant)
    3. EditPostModal itself — new defensive render guard locks out any
       non-allowed status even if opened programmatically
    4. Server PATCH `/api/posts/[id]` — already gated to
       `{draft, rejected}` only; returns 422 otherwise (pre-existing)
  - Allowed refine statuses (canonical):
    - `draft` — operator edits before submission
    - `pending_approval` — reviewer refines before approving
    - `rejected` — author fixes issues before resubmitting
  - Docs updated: 00-architecture.md, 03-ui-pages.md, 06-workflows-roles.md,
    07-ai-boundaries.md, plus ROADMAP.md for the item resolution.
  - Confirmation: approved-payload snapshot is **DEFERRED** under this
    policy. If the policy is ever reversed (refine-after-approval allowed),
    snapshotting would need to land before enabling that flow so Manus
    doesn't dispatch a mutated payload on retry.

- Task: Phase 2 — Real retry redispatch for failed platform deliveries
  - Status: Complete
  - Files changed:
    - src/lib/audit.ts — added `AuditAction.DELIVERY_RETRIED = "delivery.retried"`
      under a new "Deliveries (Manus publishing)" section.
    - src/app/api/posts/[id]/deliveries/[platform]/retry/route.ts — hardened:
      - Drops the stale `TODO: signal the Manus dispatcher (follow-up work)`
        comment (Cloud Scheduler + dispatcher pickup is live now)
      - Sets `scheduled_for = now()` on retry so the DB row explicitly states
        "pick this up on the next dispatcher tick" (was: row kept its old
        past scheduled_for, functionally equivalent but semantically fuzzy)
      - Writes a `writeAuditLog(DELIVERY_RETRIED)` entry per retry call with
        before/after snapshot of status, retry_count, last_error, scheduled_for,
        plus post_id and platform in the after-snapshot
      - Refreshed the doc comment to describe current operational reality
        (Cloud Scheduler picks it up on next tick)
    - src/components/posts/delivery-status-modal.tsx — added a small
      same-payload helper note under the deliveries table whenever at least
      one failed delivery is present:
      "Retry resends the same approved content to the failed platform. It
       does not regenerate content or require re-approval. Manus reattempts
       on the next dispatcher tick."
    - docs/00-architecture.md — Dispatcher retry sentence now names the retry
      endpoint, the scheduled_for reset, the audit entry, and Cloud Scheduler
      as the automatic pickup path.
    - docs/03-ui-pages.md — Delivery Status modal bullet updated to reflect
      new state-change set + audit entry + Cloud Scheduler pickup; new bullet
      mentions the helper note.
    - docs/06-workflows-roles.md — Retries section adds the API route, state
      transition, audit entry, Cloud Scheduler pickup behavior, and the
      brand_manager+ gate.
    - docs/07-ai-boundaries.md — unchanged (existing wording is still correct).
  - How retry now works end-to-end:
    1. Manus callback flips a delivery to `failed` with `last_error`
    2. Parent Post reconciled to `failed` (or `partial` in multi-platform posts)
    3. Operator opens Delivery Status modal, sees the failed row + helper note
    4. Operator clicks Retry → `POST /api/posts/[id]/deliveries/[platform]/retry`
    5. Route validates role (brand_manager+), brand scope, delivery is `failed`
    6. Route updates delivery: `status=queued`, `scheduled_for=now()`,
       `retry_count++`, `last_error=null`. Worker stays `"manus"`.
    7. Audit log entry `delivery.retried` written with before/after snapshot
    8. Next Cloud Scheduler tick (≤2 min) → dispatcher's atomic claim picks up
       the queued row, flips to `publishing`, hands payload to Manus
    9. Manus callback brings outcome back → delivery + parent Post reconcile
  - State changes on retry (summary):
    - status           failed → queued
    - scheduled_for    → now()
    - retry_count      += 1
    - last_error       → null
    - worker           preserved ("manus")
  - Retry All Failed: supported via the client-side loop in the modal — it
    calls the per-platform endpoint once per failed delivery (one audit entry
    per delivery). No bulk endpoint added; current single-platform-per-post
    model means typical retry = 1 delivery, so a bulk route would be API
    surface without a current use case. Revisit if multi-platform posts become
    common.
  - Same-payload guarantee (today):
    - Dispatcher reads live Post fields at dispatch time
    - Current policy (per docs/07-ai-boundaries.md + ROADMAP Phase 2 item 8)
      does not allow refine-after-approval
    - As long as that policy holds, retry resends the exact approved payload
      with no regeneration and no re-approval
    - If refine-after-approval is ever allowed, approved-payload snapshot
      (ROADMAP Phase 2 item 10) becomes required to preserve this guarantee
  - Safety properties:
    - Retrying a `posted` delivery → 422 "Only failed deliveries can be retried"
    - Retrying an unknown delivery → 404
    - Retrying across brands (wrong active brand) → 403 / 404
    - Repeated retry clicks before response returns: bounded — worst case
      `retry_count` increments by 2 instead of 1. Acceptable (pre-existing).
  - Docs updated: docs/00-architecture.md, docs/03-ui-pages.md,
    docs/06-workflows-roles.md. docs/02-data-model.md unchanged (all relevant
    fields already documented).
  - Remaining Phase 2 follow-ups (still open per ROADMAP):
    - Approved-payload snapshot (only needed if refine-after-approval lands)
    - Finalize Manus external response protocol (error taxonomy, external_ref)
    - Refine-after-approval decision itself
    - Auto-retry / exponential backoff — not planned for MVP

- Task: Phase 2 — Provisioned Cloud Scheduler job in GCP (dev-mode config)
  - Status: Complete
  - GCP actions taken:
    - Enabled `cloudscheduler.googleapis.com` on project `mktagent-493404`
    - Created HTTP scheduler job `mkt-agent-dispatch` in `asia-east2`:
      - URI: `http://34.92.70.250/api/jobs/dispatch` (raw HTTP — dev trade-off;
        see `docs/08-deployment.md` "Current dev configuration" callout)
      - Schedule: `*/2 * * * *` (every 2 minutes)
      - Timezone: `Asia/Manila`
      - Method: POST; body: `{}`; content-type header set
      - Auth header: `x-dispatch-secret=<MANUS_DISPATCH_SECRET>`
      - Attempt deadline: 60s; retry defaults
    - App Engine region anchor **not required** in `asia-east2` (modern CS)
    - Verified via force-run + scheduled tick: `state=ENABLED`,
      `lastAttemptTime` populated, `status={}` (= success), and
      `sudo pm2 logs mkt-agent` on the VM shows matching
      `[manus-dispatcher] claimed=0 batch=25` lines every 2 minutes.
  - Files changed:
    - docs/08-deployment.md — added "Current dev configuration" callout noting
      the raw-HTTP target, dispatch secret in clear text, upgrade path
      (domain + HTTPS + secret rotation + single `gcloud scheduler jobs update`),
      and the operational note that prod app PM2 is owned by root
      (`sudo pm2 logs mkt-agent`).
  - Follow-ups (deferred, not blocking Phase 2):
    - Before real Manus traffic: move target URL to HTTPS (Cloudflare proxy
      or Let's Encrypt), rotate `MANUS_DISPATCH_SECRET`, update the scheduler
      job's URI + header
    - Clean up the stray `max` / `moloh` user PM2 daemons on the VM (cosmetic;
      prod app is owned by root's PM2 and is fine)

- Task: Phase 2 — GCP Cloud Scheduler readiness for /api/jobs/dispatch
  - Status: Complete
  - Files changed:
    - src/app/api/jobs/dispatch/route.ts — hardened:
      - Missing `MANUS_DISPATCH_SECRET` now returns 503 (was 422 VALIDATION).
        Aligns with the callback route pattern + correct HTTP semantics — CS
        retries 5xx automatically, so the job self-heals once the env is set.
      - Secret header compare is now constant-time (`crypto.timingSafeEqual`
        on equal-length buffers) to avoid byte-by-byte timing leakage.
      - Updated doc comment to point at `docs/08-deployment.md`.
    - docs/08-deployment.md (new) — ops/deployment runbook. Sections:
      - Production target (VM location, app path, deploy script pointers)
      - Cloud Scheduler contract table (method/URL/header/frequency/timezone)
      - `gcloud scheduler jobs create http` command to create the job
      - Secret rotation command (`jobs update http --update-headers`)
      - Pre-flight checklist before enabling the scheduler
      - Manual smoke test `curl` + expected response shape + semantics
      - Verification paths (Cloud Console, PM2 logs, end-to-end flow)
      - Pause/resume commands
      - Env vars checklist for production
    - docs/00-architecture.md — Dispatcher subsection gets a short pointer
      to `docs/08-deployment.md` for scheduler setup + the self-heal behavior.
  - Cloud Scheduler contract (production):
    - Method: `POST`
    - URL: `https://<your-domain>/api/jobs/dispatch`
    - Header: `x-dispatch-secret: <MANUS_DISPATCH_SECRET>`
    - Body: empty
    - Frequency: `*/2 * * * *` (every 2 minutes, recommended default)
    - Timezone: `Asia/Manila`
    - Attempt deadline: 60s
    - Retry: CS defaults (5xx auto-retried; 401 does not)
  - Recommended frequency: `*/2` = every 2 minutes. Tunable 1–5 minutes based
    on scheduled-post latency tolerance. Cost is negligible at this cadence.
  - Setup instructions added (in `docs/08-deployment.md`):
    - Single idempotent `gcloud scheduler jobs create http` command
    - Region: `asia-east2` (matches the VM zone `asia-east2-c`)
    - Project: `mktagent-493404` (same GCP project used by BigQuery)
  - Helper scripts/commands added: none separate — the runbook includes
    copy-pasteable `gcloud` commands. A dedicated shell script would be
    infra overbuild for a one-time setup.
  - Code hardening tweaks:
    - 422 → 503 for unconfigured secret
    - Constant-time secret compare
  - Docs updated: docs/08-deployment.md (new), docs/00-architecture.md
    (Dispatcher subsection pointer).
  - Remaining Phase 2 follow-ups (still open per ROADMAP):
    - Actual retry redispatch wiring beyond the "reset to queued" placeholder
    - Finalize Manus external response protocol (error taxonomy,
      external_ref conventions)
    - Refine-after-approval decision + approved-payload snapshot

### 2026-04-21
- Task: Phase 2 — Manus callback / webhook + post reconciliation
  - Status: Complete
  - Files changed:
    - src/app/api/manus/callback/route.ts (new) — `POST /api/manus/callback`.
      Verifies HMAC-SHA256 signature over raw body with `MANUS_WEBHOOK_SECRET`,
      parses a Zod-validated payload, looks up the delivery by `delivery_id`,
      applies the outcome idempotently, then reconciles parent Post.status.
      Bypasses session middleware (see src/proxy.ts exclusion).
    - src/lib/manus/signature.ts (new) — `verifyManusSignature(rawBody, header, secret)`.
      Reads `x-manus-signature: sha256=<hex>`, computes HMAC-SHA256, compares
      constant-time via `crypto.timingSafeEqual`. All failure modes return false
      without leaking which one.
    - src/lib/manus/reconcile.ts (new) — `reconcilePostStatus(postId)`. Loads
      the post's deliveries, runs `computePostStatusFromDeliveries()`, then
      updates `Post.status` if changed. Also sets `Post.posted_at` (= max of
      delivery posted_at across posted deliveries) when the post transitions
      to `posted` and posted_at was null. Invalid status transitions are logged
      as warnings but still applied — Manus is authoritative on outcomes.
    - src/lib/delivery-aggregation.ts — input type loosened from
      `PlatformDelivery[]` (client-facing) to minimal structural
      `Array<{ status: string }>` so server code can pass Prisma rows directly.
      Removed the `PlatformDelivery` import. All existing call sites still work
      via structural compatibility.
    - src/proxy.ts — matcher widened to also exclude `api/manus` from the
      session-auth middleware, matching the `api/jobs` pattern.
    - .env.production.example — added `MANUS_WEBHOOK_SECRET` with header
      contract comment.
    - docs/00-architecture.md — new "Callback / webhook" subsection below the
      Dispatcher section; replaces the old "callback route (not in this task)"
      placeholder wording.
    - docs/06-workflows-roles.md — approval flow steps 6 & 7 now describe the
      implemented callback + reconciler (was "follow-up work" before).
    - docs/07-ai-boundaries.md — Manus publishing boundary explicitly calls out
      that the callback route never re-enters the AI layer.
  - Route path: `POST /api/manus/callback` (single outcome per request).
  - Callback payload:
    ```
    { delivery_id: string,          // primary correlation key
      post_id?: string,             // optional validation cross-check
      platform?: "instagram"|...,   // optional validation cross-check
      outcome: "posted" | "failed",
      external_post_id?: string,    // success
      error?: string,               // failure
      attempted_at?: string }       // ISO datetime; defaults to now()
    ```
  - Security / signature approach:
    - HMAC-SHA256 over raw request body with `MANUS_WEBHOOK_SECRET`.
    - Header: `x-manus-signature: sha256=<hex>` (lowercase hex).
    - Fail-closed: 503 when secret is unset; 401 on invalid/missing signature.
    - Constant-time compare via `crypto.timingSafeEqual`.
    - Next step (future task): rotate secret via env change; no code change.
  - Idempotency handling (matrix by current delivery status × incoming outcome):
    - posted + posted → no-op; backfill `external_post_id` if currently null
    - posted + failed → **refused** (don't regress success); 200 with
      `refused=true` so Manus stops retrying; parent reconciliation skipped
    - failed + failed → update `last_error` + `publish_attempted_at` only if
      the error message differs; `retry_count` untouched (operator-driven)
    - failed + posted → flip to posted (Manus internal retry succeeded)
    - queued/scheduled/publishing + posted → full success update
    - queued/scheduled/publishing + failed → full failure update
  - Delivery row updates:
    - Success: `status=posted`, `posted_at=attempted_at`,
      `publish_attempted_at ??= attempted_at`, set `external_post_id`,
      clear `last_error`
    - Failure: `status=failed`, `publish_attempted_at=attempted_at`,
      `last_error=payload.error ?? "Unknown error"`
    - `worker` kept as "manus"; never regenerates content, re-approves, or
      re-runs source logic
  - Parent-post reconciliation trigger:
    - After any delivery state change (skipped on refused/no-op), the route
      calls `reconcilePostStatus(delivery.post_id)`
    - Reconciler reads all deliveries for the post, computes via
      `computePostStatusFromDeliveries()`, updates `Post.status` if changed,
      and sets `Post.posted_at` on the first transition to `posted`
  - Small helper change:
    - `computePostStatusFromDeliveries()` input type loosened to
      `{ status: string }[]` so it's safely usable from server (Prisma rows)
      without pulling in the client-facing `PlatformDelivery` type
  - Error responses:
    - 503 — `MANUS_WEBHOOK_SECRET` not configured
    - 401 — invalid / missing signature
    - 400 — invalid JSON or schema violation (with per-issue details)
    - 404 — `delivery_id` not found
    - 409 — `post_id` / `platform` in payload mismatch the delivery row
    - 200 — applied or idempotent, body:
      `{ ok, idempotent, refused, delivery_id, post_id, platform, applied_status, post_status }`
  - Observability: one `[manus-callback]` log line per request with
    delivery_id, platform, outcome, post_id, sig_ok, idempotent, refused,
    post_status. Warnings on signature fail / delivery-not-found / mismatch /
    posted→failed refusal / non-standard post transitions.
  - Docs updated: docs/00-architecture.md, docs/06-workflows-roles.md,
    docs/07-ai-boundaries.md. docs/02-data-model.md unchanged (all needed
    fields were already on `post_platform_deliveries`).
  - Remaining Phase 2 follow-ups (still open per ROADMAP):
    - Actual retry redispatch wiring beyond the "reset to queued" placeholder
    - GCP Cloud Scheduler setup for `/api/jobs/dispatch`
    - Finalize Manus external response protocol (error taxonomy,
      external_ref conventions)
    - Refine-after-approval decision + approved-payload snapshot

### 2026-04-21
- Task: Phase 2 — Create PostPlatformDelivery rows at approval / scheduling time
  - Status: Complete
  - Files changed:
    - src/lib/manus/delivery-creator.ts (new) — `ensureDeliveriesForPost(post, now?)`.
      Inserts one PostPlatformDelivery for `(post.id, post.platform)`, chooses
      status based on `scheduled_for > now` (`scheduled`) vs `<= now` (`queued`),
      sets `worker = "manus"`. Idempotent: uses `createMany({ skipDuplicates: true })`
      against the existing `@@unique([post_id, platform])` constraint.
    - src/app/api/posts/[id]/approve/route.ts — after the post transitions to
      `scheduled`, calls `ensureDeliveriesForPost()`. This is the main lifecycle
      entry point (approval moves `pending_approval` → `scheduled` directly and
      now also seeds the delivery row).
    - src/app/api/posts/[id]/schedule/route.ts — also calls
      `ensureDeliveriesForPost()` after the post moves to `scheduled`. The
      endpoint enforces `scheduled_at` is in the future, so the new delivery
      row is always inserted as `status = 'scheduled'` from this path.
    - src/lib/manus/dispatcher.ts — claim SQL widened from `status = 'queued'`
      to `status IN ('queued','scheduled')`. Future-dated `scheduled` rows
      transition directly to `publishing` when `scheduled_for` passes — no
      intermediate flip needed.
    - src/components/posts/delivery-status-modal.tsx — empty-state copy
      updated: "Delivery rows are created at approval; this post has not been
      approved yet" (replaces the stale "appear when Manus begins publishing"
      message — rows now exist from the moment approve/schedule runs).
    - docs/00-architecture.md — new "Delivery rows — creation path" subsection
      above the Dispatcher section; Dispatcher subsection updated for the new
      claim predicate and the scheduled → publishing transition.
    - docs/02-data-model.md — `delivery_status` enum values documented with
      their operational meaning; `post_platform_deliveries` entry now describes
      when rows are written (approve/schedule) and the `queued` vs `scheduled`
      split.
    - docs/06-workflows-roles.md — approval flow expanded: new step 4 describes
      delivery-row creation via `ensureDeliveriesForPost()`; subsequent steps
      renumbered. Dispatcher step notes the `status IN ('queued','scheduled')`
      claim predicate.
  - Where delivery rows are created:
    - `POST /api/posts/[id]/approve` — post enters lifecycle via approval
    - `POST /api/posts/[id]/schedule` — post scheduled explicitly (also a
      lifecycle entry point for the legacy `approved` → `scheduled` path)
  - Immediate vs future scheduled handling:
    - Immediate (`scheduled_at` missing or `<= now`): delivery inserted as
      `queued` with `scheduled_for = now()` — picked on the next dispatcher pass
    - Future (`scheduled_at > now`): delivery inserted as `scheduled` with
      `scheduled_for = post.scheduled_at` — invisible to the dispatcher until
      its time arrives, then claimed alongside queued rows and transitioned to
      `publishing`
  - How duplicate delivery rows are prevented:
    - Existing `@@unique([post_id, platform])` constraint on
      `post_platform_deliveries` + Prisma `createMany({ skipDuplicates: true })`.
      Re-calling approve or schedule on an already-scheduled post does NOT
      duplicate deliveries (it would also fail status-transition validation
      first — `scheduled → scheduled` isn't a legal transition).
  - Dispatcher changes:
    - One-line predicate widening from `status = 'queued'` to
      `status IN ('queued','scheduled')`. Same atomic
      `FOR UPDATE SKIP LOCKED` + `UPDATE ... RETURNING` pattern. No behavior
      change for existing queued rows; scheduled rows just become eligible when
      `scheduled_for <= now()`.
  - Explicitly out of scope (remain in ROADMAP Phase 2):
    - Manus callback / webhook route
    - Post-level status reconciliation via
      `computePostStatusFromDeliveries()`
    - Wiring actual retry redispatch (the placeholder retry route already
      resets to `queued`; the next dispatcher pass now picks it up — proved by
      this change)
    - Cloud Scheduler setup for `/api/jobs/dispatch`
    - Signed callback verification
    - Approved payload snapshot (only needed if refine-after-approval lands)

### 2026-04-21
- Task: Manus dispatcher foundation
  - Status: Complete (dispatcher + handoff boundary + trigger route + env surface)
  - Files changed:
    - src/lib/manus/types.ts (new) — ManusDispatchPayload, ManusDispatchResult,
      DispatcherSummary shapes. Flat contracts, easy to extend.
    - src/lib/manus/client.ts (new) — dispatchToManus() handoff boundary.
      Dry-run mode when MANUS_AGENT_ENDPOINT is unset (logs payload + returns
      accepted=true, dry_run=true). When configured: POST with optional
      MANUS_API_KEY bearer; returns accepted/error plus optional external_ref.
    - src/lib/manus/dispatcher.ts (new) — runManusDispatcher({ batchSize }):
      1. Atomic claim via db.$queryRaw:
         UPDATE post_platform_deliveries SET status='publishing',
           publish_requested_at=now(), updated_at=now()
         WHERE id IN (SELECT id FROM post_platform_deliveries
                      WHERE status='queued' AND scheduled_for<=now()
                      ORDER BY scheduled_for ASC LIMIT $batch
                      FOR UPDATE SKIP LOCKED)
         RETURNING id, post_id, platform, scheduled_for, retry_count;
      2. Batch-load parent posts (+ brand select) — no N+1
      3. Build ManusDispatchPayload per claimed row
      4. Hand off via dispatchToManus()
      Returns DispatcherSummary { picked, claimed, dispatched, errors[], dry_run }.
      Logs per-delivery dispatch + errors with platform/post/delivery ids.
    - src/app/api/jobs/dispatch/route.ts (new) — POST trigger. Auth via
      `x-dispatch-secret` header matching MANUS_DISPATCH_SECRET env var. Returns
      503-equivalent validation error if secret unconfigured (safer than silently
      accepting anonymous pokes). Designed for cron/curl.
    - .env.production.example — added MANUS_AGENT_ENDPOINT, MANUS_API_KEY,
      MANUS_DISPATCH_SECRET with inline comments
    - docs/00-architecture.md — new Dispatcher subsection detailing atomic claim,
      handoff boundary, dry-run mode, correlation keys, retry compatibility
    - docs/06-workflows-roles.md — approval flow updated: step 4 now references
      the dispatcher route + picker + atomic claim + no-regeneration rule;
      step 5/6 split (callback updates individual deliveries; reconciler aggregates)
  - Where the dispatcher lives:
    - Core logic: src/lib/manus/dispatcher.ts (importable from any entry point)
    - HTTP entry: POST /api/jobs/dispatch (cron-friendly, secret-gated)
    - Handoff boundary: src/lib/manus/client.ts (swap for real Manus later)
  - How the picker works:
    - Status = 'queued' AND scheduled_for <= now() — handles both immediate
      (scheduled_for=now()) and future-scheduled deliveries uniformly
    - Ordered by scheduled_for ASC (oldest first)
    - Batched (default 25 per pass)
  - How safe claiming works:
    - Single SQL statement: inner SELECT ... FOR UPDATE SKIP LOCKED chooses
      the batch, outer UPDATE transitions them to publishing + sets
      publish_requested_at. RETURNING clause yields the claimed rows atomically.
    - Concurrent dispatchers NEVER pick the same row (SKIP LOCKED guarantees it).
    - Prisma doesn't natively expose FOR UPDATE SKIP LOCKED, so raw SQL is used
      for this one step. Everything else stays on the typed Prisma client.
  - Payload shape sent to Manus:
    {
      post_id, delivery_id, platform,
      brand: { id, name },
      content: { headline, caption, cta, banner_text, image_prompt },
      scheduled_for (ISO or null),
      source: { post_type, source_type, source_id, source_instance_key },
      retry_count
    }
    Taken directly from the approved parent Post — no regeneration, no
    re-approval, no source re-run. post_id + delivery_id are the stable
    correlation keys Manus must echo on callbacks.
  - Env vars introduced:
    - MANUS_AGENT_ENDPOINT — Manus agent URL (unset → dry-run mode)
    - MANUS_API_KEY — bearer token sent with the request (optional)
    - MANUS_DISPATCH_SECRET — shared secret for POST /api/jobs/dispatch
      (required; generate with openssl rand -base64 32)
  - Scheduled vs immediate: unified via scheduled_for <= now(). Creators that
    want immediate dispatch set scheduled_for = now() when inserting the delivery.
  - Retry compatibility: a failed delivery reset back to 'queued' (the existing
    placeholder retry route does this) becomes eligible for the next dispatcher
    pass automatically — same payload, same correlation keys.
  - Observability: every pass logs [manus-dispatcher] claimed=N batch=M, then
    one line per dispatch with delivery_id/platform/post_id and dry-run flag.
    Handoff failures log at warn level with the error message.
  - Placeholders / follow-ups remaining for full integration:
    1. Manus callback/webhook route (POST .../callback) that receives per-platform
       results and transitions deliveries posted/failed with posted_at, external_post_id,
       last_error
    2. Reconciler that reads deliveries and updates Post.status via
       computePostStatusFromDeliveries() from src/lib/delivery-aggregation.ts
    3. Creator path that inserts PostPlatformDelivery rows at post creation /
       scheduling time (currently the queue only has the delivery model but no
       writer; the Approve endpoint + scheduler will need to create rows)
    4. Actual retry dispatch wiring — existing retry API just resets state;
       the dispatcher picks the reset row up on the next tick
    5. Cron setup — external (GCP Cloud Scheduler hitting /api/jobs/dispatch
       with the secret header every 1–5 minutes)
    6. Approved-payload snapshot: if refine-after-approval is ever allowed,
       we'd want to freeze the dispatched content. For now the dispatcher
       reads the live Post fields.
    7. Manus response protocol finalization — external_ref handling, error
       taxonomy, signed callbacks

### 2026-04-21
- Task: Publishing lifecycle cleanup — Approved becomes metadata; Delivery modal foundation
  - Status: Complete
  - Files changed:
    - prisma/migrations/20260421200000_approved_to_scheduled/migration.sql (new)
      — UPDATE posts SET status='scheduled', scheduled_at=COALESCE(scheduled_at, approved_at, now())
        WHERE status='approved'. Existing legacy rows migrated.
    - src/lib/post-status.ts — VALID_TRANSITIONS updated: pending_approval can now go
      directly to scheduled (rejected still valid). Legacy `approved` transitions kept.
    - src/app/api/posts/[id]/approve/route.ts — approval now:
      * sets status=scheduled (not approved)
      * writes approved_at + approved_by (metadata)
      * defaults scheduled_at to now() if null
      * transitions via isValidTransition(post.status, "scheduled")
    - src/app/api/posts/route.ts — date-range filter adds `posted` branch using posted_at
      (primary); legacy `approved` branch kept as fallback
    - src/app/api/posts/[id]/deliveries/route.ts (new) — GET returns per-platform
      deliveries + post snapshot; readable by any authenticated user
    - src/app/api/posts/[id]/deliveries/[platform]/retry/route.ts (new) — POST placeholder
      retry: validates delivery is in `failed` state, resets to queued, bumps retry_count,
      clears last_error. Gated to brand_manager+. TODO for actual Manus dispatcher.
    - src/lib/posts-api.ts — added PlatformDelivery interface + getDeliveries + retryDelivery
      client methods
    - src/lib/delivery-aggregation.ts (new) — computePostStatusFromDeliveries() helper
      implementing the aggregation rules (publishing > scheduled > posted/failed/partial)
    - src/components/posts/delivery-status-modal.tsx (new) — full modal with table
      (platform, status chip, scheduled, attempted, posted/error, retry button), empty
      state when no deliveries yet, Retry All Failed footer button
    - src/app/(app)/queue/page.tsx:
      * STATUSES filter: removed "Approved"; added "Publishing" and "Partial"
      * DELIVERY_STATUSES set added for row action gating
      * showSchedule now gated on status=scheduled (was: approved)
      * showDelivery gates on DELIVERY_STATUSES
      * New View Delivery action button (Send icon, cyan) opens the modal
      * Page wires setDeliveryPostId state + DeliveryStatusModal instance
    - src/app/(app)/calendar/page.tsx — STATUS_OPTIONS "Approved (Posted)" replaced with
      "Posted"; default `statuses` query switched from "approved,scheduled" to
      "posted,scheduled"
    - src/lib/calendar-utils.ts — getPostDate() now checks status==="posted" instead of
      "approved" for posted_at display
    - src/components/calendar/calendar-post-card.tsx — STATUS_CARD_STYLES + StatusIndicator
      + detail dialog all switched from "approved" key to "posted"
    - docs/00-architecture.md, docs/02-data-model.md, docs/03-ui-pages.md,
      docs/06-workflows-roles.md — updated; CLAUDE.md also updated
  - Where Approved was removed from visible status handling:
    - Queue page STATUSES filter
    - Calendar page STATUS_OPTIONS filter + default query
    - Calendar post card visual styles + status indicator + detail dialog
    - calendar-utils.getPostDate branching
    - Approve API endpoint no longer sets status=approved
    - Data migration converted existing rows
    - Kept in enum for historical rows + legacy fallback in posts-list date-range filter
  - Current visible lifecycle:
    Draft → Pending Approval → Scheduled → Publishing → Posted | Partial | Failed
    (Rejected is a terminal path from Pending Approval)
    approved_at + approved_by persist as metadata only.
  - Delivery modal behavior:
    - Opens via "View Delivery" action (Send icon) when post has entered delivery lifecycle
    - Fetches GET /api/posts/[id]/deliveries
    - Shows one row per platform with status chip, scheduled time, attempted time,
      posted_at + external_post_id (on success) or last_error + retry_count (on failure)
    - Retry button on each failed row + "Retry All Failed" footer button when >1 failed
    - Empty state when no deliveries have been dispatched yet
  - Retry UI behavior:
    - POST /api/posts/[id]/deliveries/[platform]/retry resets delivery to queued
    - Bumps retry_count, clears last_error
    - Requires brand_manager+ role, single-brand context
    - TODO: signal the Manus dispatcher when that lands
    - Does NOT regenerate, does NOT re-approve
  - Schema adjustments: none beyond the one-shot data migration (status values, enum,
    and delivery model were all set up in earlier tasks)
  - Docs updated: CLAUDE.md, docs/00-architecture.md, docs/02-data-model.md,
    docs/03-ui-pages.md, docs/06-workflows-roles.md
  - Remaining follow-up items for full Manus integration:
    1. Manus dispatcher service — picks up scheduled posts whose scheduled_at <= now()
       and creates PostPlatformDelivery rows + dispatches delivery jobs
    2. Webhook / callback route — Manus reports per-platform results (posted, failed)
    3. Post-level status reconciler — runs computePostStatusFromDeliveries() and updates
       post.status whenever a delivery transitions
    4. Post detail page — surface the delivery modal from a View Delivery button there too
       (currently wired only in Queue; detail page is a small follow-up)
    5. Manus credentials / webhook signing (env-level config, out of scope here)
    6. Retry trigger — after placeholder retry, the dispatcher needs to actually redispatch
       the queued delivery job

### 2026-04-21
- Task: Manus publishing architecture — docs + minimal schema hooks
  - Status: Complete (architecture + schema surface only; full Manus integration deferred)
  - Schema/model changes (migration 20260421180000_manus_publishing):
    - PostStatus enum: added `publishing`, `partial` (kept `approved` for metadata + brief handoff)
    - New DeliveryStatus enum: queued | scheduled | publishing | posted | failed
    - New model PostPlatformDelivery (table post_platform_deliveries):
      * id, post_id (FK cascade), platform, status (DeliveryStatus), scheduled_for,
        publish_requested_at, publish_attempted_at, posted_at, external_post_id,
        retry_count, last_error, worker ("manus"), created_at, updated_at
      * unique (post_id, platform); indexes on (post_id) and (status, scheduled_for)
    - Post: added `deliveries PostPlatformDelivery[]` back-relation
  - Code changes:
    - src/lib/validations/post.ts — postStatusValues adds `publishing` + `partial`
    - src/lib/post-status.ts — VALID_TRANSITIONS updated for the new lifecycle:
      approved → {scheduled, publishing, posted, failed}; scheduled → {publishing, posted, failed};
      publishing → {posted, partial, failed}; partial → {publishing}; failed → {publishing}
    - src/components/posts/status-badge.tsx — new entries for `publishing` (cyan, Loader2)
      and `partial` (orange, CircleDot)
  - Docs changes:
    - CLAUDE.md — added Manus publishing principles + Approved ≠ Posted clarification
    - docs/00-architecture.md — new Publishing — Manus worker section
    - docs/02-data-model.md — new post_platform_deliveries table + DeliveryStatus enum
      + updated post_status enum with publishing/partial
    - docs/03-ui-pages.md — target row actions model (core + overflow), Delivery Status
      modal plan, Scheduled-posts clarity note (approved = metadata, not operational state)
    - docs/06-workflows-roles.md — rewrote Content Queue Status Lifecycle section for
      the Manus flow (review-side vs delivery-side), approval flow steps, retry rules
    - docs/07-ai-boundaries.md — new Manus Publishing — AI Boundary section
      (no AI at publish or retry; retry resends approved payload)
  - Target lifecycle model:
    - Review-side: draft → pending_approval → approved (metadata) | rejected
    - Delivery-side: scheduled → publishing → posted | partial | failed
    - approved_at + approved_by: metadata only; operational state after approval
      becomes scheduled (or briefly publishing for immediate sends)
  - Retry model:
    - Lives at PostPlatformDelivery level (per-platform, not per-post)
    - Resends same approved content payload via Manus
    - Does NOT regenerate content or re-run automation source logic
    - Does NOT require re-approval
    - Increments retry_count; updates publish_attempted_at / last_error / status
  - Per-platform delivery structure: see PostPlatformDelivery model (above)
  - Follow-up items (not implemented, flagged here):
    1. Manus dispatcher — service/worker that picks up scheduled posts and sends to platforms
    2. Per-platform status reporter — webhook or polling route that updates deliveries
    3. Post-level status aggregation from deliveries (e.g. all posted → posted, some failed → partial)
    4. Delivery Status modal UI (planned in docs/03-ui-pages.md)
    5. Retry API endpoints (per-platform + retry-all-failed)
    6. "View Delivery" overflow action in queue row
    7. Calendar wording audit (calendar still uses older approved=posted semantics)
    8. Approve endpoint transition — update it to set status=scheduled (not approved)
       once Manus is wired. For now approved is kept to avoid breaking the existing flow.

- Task: Content Queue audit refinements
  - Status: Complete
  - Schema changes (migration 20260421120000_queue_audit):
    - PostType enum: added `hot_games`
    - SourceType enum: added `hot_games`
    - Post: added `rejected_at` (DateTime?), `rejected_by` (String?, FK to users), `approved_at` (DateTime?)
    - User: added `posts_rejected` back-relation (PostRejectedBy)
  - Files changed:
    - prisma/schema.prisma + prisma/migrations/20260421120000_queue_audit/migration.sql
    - src/lib/validations/post.ts — hot_games added to postTypeValues + sourceTypeValues
    - src/app/api/posts/[id]/reject/route.ts — sets rejected_at + rejected_by
    - src/app/api/posts/[id]/approve/route.ts — sets approved_at
    - src/app/api/posts/route.ts — GET enriches each post with schedule_summary (window + cadence)
      and sample_group ({id, index, total}) derived from generation_context_json
    - src/lib/posts-api.ts — Post interface adds rejected_at, rejected_by, approved_at,
      schedule_summary, sample_group
    - src/app/(app)/queue/page.tsx:
      * Type filter: Hot Games added
      * Badge: hot_games → "Hot" (rose)
      * Column: Recurrence → Schedule, renders post.schedule_summary (wraps on long text)
      * Sample group: "Sample N/M" chip in preview cell, deterministic colored left border
        (border-l-4) on first visible cell for siblings
    - src/app/(app)/queue/[id]/page.tsx — rejection block now shows rejected_at + rejected_by
    - src/components/posts/edit-post-modal.tsx — renamed "Edit Post" → "Refine Post",
      CTA renamed to "Apply Refinement". Added Locked Context panel at top showing source
      type, event title, schedule summary, Hot Games snapshot summary, and source-specific
      reminder. Universal helper note below textarea: "You may refine visual style, tone,
      and presentation. Fixed rules, reward, timing, and source context will remain unchanged."
    - docs/03-ui-pages.md, docs/06-workflows-roles.md, docs/07-ai-boundaries.md — updated
  - How Schedule column works:
    * Event-derived with posting instance: "Apr 1 – Apr 30 • Daily 3:00 PM"
    * Event-derived Generate Now: "Apr 1 – Apr 30 • Generate Now • One-time" (or bare if no dates)
    * big_win post_type: "Always-on • Big Win automation"
    * hot_games post_type: "Always-on • Hot Games scan"
    * else: "—"
  - How sample grouping is shown:
    * generation_context_json keys sample_group_id / sample_index / sample_total are
      read server-side and surfaced as post.sample_group on the client
    * UI: "Sample N/M" chip next to creator name in preview cell + colored left border
      on first visible cell of the row. Siblings share color via deterministic hash of
      sample_group_id.
    * No DB column added — uses existing generation_context_json
  - How refine/edit constraints are communicated:
    * Locked Context panel at top of modal is always shown when source_type is set
    * Per-source reminders: Event (rules + posting instance fixed), Hot Games (frozen
      snapshot reused), Big Win (rule-matched values + username logic fixed)
    * Universal note below instruction textarea spells out what CAN be refined vs what stays fixed
    * Modal title is now "Refine Post"; CTA is "Apply Refinement"
  - Status interpretation:
    * Audited StatusBadge — labels already match canonical model
      (Draft / Pending / Approved / Scheduled / Posted / Rejected / Failed)
    * Approved uses emerald + CheckCircle2; Posted uses violet + SendHorizontal — never conflated
    * docs/06-workflows-roles.md now codifies this status lifecycle
    * Calendar page still uses older "approved = posted" semantics — flagged as follow-up per spec scope
  - Rejected posts retention:
    * Data-side unchanged — status=rejected persists
    * UI: status filter option Rejected still surfaces them
    * Rejection metadata now captured (rejected_at + rejected_by) and displayed on post detail
    * Rejected drafts remain part of historical/learning dataset alongside approved/edited/posted
  - Hot Games added to Type filter: confirmed — value "hot_games", label "Hot Games", badge "Hot" (rose)
  - Docs updated: 03-ui-pages.md, 06-workflows-roles.md, 07-ai-boundaries.md

### 2026-04-21
- Task: Calendar header — centered period label + month-overlap week labels
  - Status: Complete
  - Files changed:
    - src/lib/calendar-utils.ts — rewrote formatDateRangeLabel. Week view now outputs
      month/year context instead of a day range. Branches:
        * same month, same year → "April 2026" (full month name)
        * same year, different months → "Apr – May 2026" (short names + single year)
        * different years → "Dec 2026 – Jan 2027" (short name + year on each side)
      Month view unchanged.
    - src/app/(app)/calendar/page.tsx — header restructured from a single flex row
      into a 3-slot responsive grid (`grid-cols-[1fr_auto_1fr]` on md+). Left slot
      holds the view toggle + prev/Today/next controls grouped together. Middle slot
      is the centered period label (`text-lg font-semibold`, `justify-self-center`).
      Right slot shows the post count. Removed the inline date-range label span.
      On narrow screens the grid collapses to a single column and the label appears
      on its own row.
  - How week labels now behave:
    - Day-of-month is not duplicated (that's the grid's job).
    - Label is purely a month/year title indicating the visible week's context.
  - How overlapping months are displayed:
    - A week crossing into another month shows both — "Apr – May 2026".
    - A week crossing a year shows both years — "Dec 2026 – Jan 2027".
  - How the centered title is laid out:
    - CSS grid with three tracks: `1fr` | `auto` | `1fr`. Middle track is auto-sized
      to the label, and `justify-self-center` keeps it visually centered regardless
      of left/right slot widths. Today button unchanged; filters unchanged.

### 2026-04-21
- Task: Calendar page — week cell sizing + filter default labels
  - Status: Complete
  - Files changed:
    - src/components/calendar/calendar-week-view.tsx — date number now always renders
      inside a fixed 32×32 inline-flex slot (`w-8 h-8 rounded-full`). Today keeps the
      primary color badge treatment; non-today days show the number inside a transparent
      slot of the same size. Header row height now matches across all 7 columns.
    - src/app/(app)/calendar/page.tsx — each of the 3 filter triggers now renders
      conditional content: a muted-text "Platform" / "Type" / "Status" label when the
      filter is at "all" default; otherwise the selected option's label via SelectValue.
      Dropdown options (PLATFORMS, POST_TYPES, STATUS_OPTIONS) unchanged.
  - How current-day sizing was fixed:
    Non-today cells previously rendered the date as plain text (~28px line height) while
    today used a 32×32 rounded-full flex container. This caused today's header row to be
    slightly taller. The fix reserves an identical 32×32 badge footprint for every day
    (transparent for non-today, primary-colored for today). All columns' headers and
    content areas now have matching dimensions.
  - New default filter labels:
    - Left filter → "Platform" (when value = all)
    - Middle filter → "Type" (when value = all; filters by post type, not promotion-only)
    - Right filter → "Status" (when value = all)
    Muted text color (text-muted-foreground) so they read as placeholder hints.
    Filter logic is untouched.

### 2026-04-18
- Task: Events Posting Schedule — "Generate Now" option replacing "None"
  - Status: Complete
  - Files changed:
    - src/app/(app)/events/new/page.tsx — dropdown now: Generate Now / Daily / Weekly / Monthly.
      EMPTY.posting_frequency defaults to "generate_now". postingConfig useMemo returns null
      for generate_now. Submit button label switches to "Create Event & Generate Drafts Now"
      when Generate Now is selected. On submit with generate_now, after successful event
      creation the page calls eventsApi.generateDrafts(event.id) before navigating.
      Auto-generate checkbox hidden in generate_now mode (redundant).
    - src/app/(app)/events/[id]/page.tsx — same 4-option dropdown. initEditData defaults to
      "generate_now" when the loaded event has no posting_instance_json. saveEdit now always
      sends posting_instance_json (null when generate_now).
    - src/lib/validations/event.ts — posting_instance_json accepts null (.nullable().optional())
      in both create and update schemas
    - src/app/api/events/route.ts — POST handler converts posting_instance_json === null to
      Prisma.JsonNull for the JSON column
    - src/app/api/events/[id]/route.ts — PATCH handler does the same conversion
    - src/app/api/events/[id]/generate-drafts/route.ts — when posting_instance_json is null
      (Generate Now mode), uses a single immediate occurrence at now(). When present, uses
      the existing recurrence path. start_at/end_at only required when a posting schedule exists.
    - docs/03-ui-pages.md — documented 4 options + button label behavior
    - docs/06-workflows-roles.md — Adhoc Event Flow notes Generate Now path
  - How Generate Now works:
    - UI state only — stored on the event as posting_instance_json = null
    - On Create page submit: event is POSTed, then eventsApi.generateDrafts(id) is called,
      then navigates to /events/[id]
    - generate-drafts endpoint creates one shell post per platform at now() with
      source_instance_key = the occurrence ISO. Drafts land in Content Queue for review.
  - Validation changes:
    - posting_instance_json nullable in both create and update schemas
    - Recurrence-specific fields (weekdays/month_days) only enforced when daily/weekly/monthly
      is selected. Generate Now requires no recurrence fields.
    - generate-drafts endpoint: start_at/end_at only required for recurrence events.
  - Button label behavior (Create page):
    - "Create Event & Generate Drafts Now" when posting_frequency === "generate_now"
    - "Create Campaign Event" when Daily / Weekly / Monthly selected
    - Submitting state: "Creating & generating…" vs "Creating…"
  - Edit page keeps its normal Save label (per spec — label change scoped to Create page).

- Task: Create Event form — field-level helper text + 3 examples per field
  - Status: Complete
  - Files changed:
    - src/app/(app)/events/new/page.tsx — widened LabeledField hint type from string
      to React.ReactNode. Added a small FieldHint component that renders one line of
      helper text followed by a bulleted list of 3 short examples. Wired a FieldHint
      into each of the 8 target fields.
  - Fields now showing helper text + 3 examples (confirmed):
    1. Theme
    2. Objective
    3. Rules
    4. Reward
    5. Target Audience
    6. CTA
    7. Tone
    8. Notes for AI
  - Sample Event Brief panel unchanged.
  - Validation logic unchanged.
  - No auto-fill — helpers are static text only.

- Task: New Event page — Sample Brief guidance panel
  - Status: Complete
  - Files changed:
    - src/lib/event-sample-briefs.ts (new) — 6 coherent sample briefs (Top Fans VIP Week,
      Summer Deposit Boost, Slot Tournament Showdown, Lunar New Year Freeroll, Welcome Back
      Reactivation, New Game Launch Hype). Each has 8 internally-consistent fields.
      pickRandomSample() excludes previous index so clicks always change the sample.
    - src/components/events/sample-brief-panel.tsx (new) — self-contained panel with 8-row
      definition list, "Generate Sample Prompt" button, sticky positioning. No props,
      no callbacks to parent. Local state only.
    - src/app/(app)/events/new/page.tsx — widened container from max-w-2xl to max-w-6xl;
      wrapped form + panel in a responsive `lg:grid lg:grid-cols-3` layout; form occupies
      lg:col-span-2, sample panel occupies lg:col-span-1 with sticky behavior. On small
      screens the panel stacks below the form. Form state, validation, and submit logic
      unchanged.
    - docs/03-ui-pages.md — described the panel and its reference-only nature
    - docs/06-workflows-roles.md — added mention in Adhoc Event Flow
    - docs/07-ai-boundaries.md — clarified panel is not AI-sourced and not used as AI input
  - Sample table behavior:
    - 8 rows: Theme, Objective, Rules, Reward, Target Audience, CTA, Tone, Notes for AI
    - Values come from a hardcoded coherent brief (one concept per brief)
    - Initial brief picked randomly on mount
  - Button placement:
    - Below the table, full-width, outline variant, Dices icon for visual cue
    - Clicking picks a different brief (never repeats the currently-displayed one)
  - Real fields not auto-filled: confirmed. The panel has no props, no callbacks,
    no access to form state. Required fields (title + event_type) still enforced on submit.
  - Docs updated: docs/03-ui-pages.md, docs/06-workflows-roles.md, docs/07-ai-boundaries.md

- Task: Data source migration — shared BigQuery dataset (config-shape only)
  - Status: Complete (code side). Awaiting platform team grant + gcloud install on laptop.
  - Context: Platform team exposed shared BQ dataset (shared.users/transactions/game_rounds/games)
    updated hourly at :00 GMT+8. PII removed except username which is a display handle.
    Multi-brand identity = (username, brand_id). Schema still evolving.
  - Files changed:
    - package.json / package-lock.json — installed @google-cloud/bigquery ^8.1.1
    - .env.production.example — added BQ_PLATFORM_PROJECT_ID, BQ_DATASET, BQ_SERVICE_ACCOUNT_EMAIL
    - src/lib/validations/automation.ts — removed api_url from bigWinRuleConfigSchema,
      hotGamesRuleConfigSchema, and their defaults. Added inline source-mapping comments
      pointing at shared.game_rounds/games/users.
    - src/app/(app)/automations/page.tsx — replaced "Big Win API" + "Hot Games API" sections
      with read-only "Data Source" info panels. Added ~1h delay note on Hot Games Source Window.
      migrateBigWin + migrateHotGames drop legacy api_url silently.
    - docs/00-architecture.md — added External Data Source — Shared BigQuery section
    - docs/04-automations.md — added Data Source section (env vars, cost rules, schema volatility,
      Big Wins + Hot Games field mapping, multi-brand identity). Removed api_url from
      documented config shapes for Big Wins and Hot Games.
    - docs/02-data-model.md — added External Tables section listing shared.* schema.
    - docs/07-ai-boundaries.md — AI consumes pre-computed facts only, never raw queries.
      Added username-as-display-handle note with brand_id scoping.
  - Manual follow-ups for operator:
    1. Install gcloud CLI on laptop (GoogleCloudSDKInstaller.exe for Windows)
    2. gcloud auth login && gcloud auth application-default login
    3. gcloud config set project mktagent-493404
    4. gcloud services enable bigquery.googleapis.com
    5. gcloud iam service-accounts create mkt-agent-bq --project=mktagent-493404
       → email mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com to platform team for dataViewer grant
    6. Smoke test: node -e "new (require('@google-cloud/bigquery').BigQuery)({projectId:'mktagent-493404'}).query('SELECT 1 AS n').then(r=>console.log(r[0]))"
    7. Join platform team's Telegram channel for schema change announcements
    8. Set GCP monthly budget alert ($100 suggested)
  - Known follow-ups (not implemented):
    - Dedupe key options (win_id, transaction_id) don't match BQ — will realign when query layer lands
    - Platform team needs to confirm shared.users.username is exposed (or add it)
    - src/lib/bq/shared-schema.ts adapter module (single source of truth for column references)
      will be created when query execution is implemented
    - Daily health-check query to detect missing columns
    - Service account JSON key + GOOGLE_APPLICATION_CREDENTIALS — generated only when query layer lands

- Task: Hot Games tab refinement — dropdowns, ascending time mapping, frozen snapshot
  - Status: Complete
  - Files changed:
    - prisma/schema.prisma — added Post.generation_context_json (Json?)
    - prisma/migrations/20260418220000_post_generation_context/migration.sql (new) —
      applied successfully to Neon
    - src/lib/validations/automation.ts — hotGamesRuleConfigSchema: source_window_minutes
      as literal union (30/60/90/120), hot_games_count (renamed from top_games_count) as
      literal union (3–10), time_mapping (renamed from fixed_time_mapping) with length
      matching hot_games_count + ascending order refinement, removed draft_delay_minutes.
      Exported HOT_GAMES_SOURCE_WINDOWS and HOT_GAMES_COUNT_OPTIONS constants.
    - src/lib/posts-api.ts — added generation_context_json to Post interface
    - src/app/(app)/automations/page.tsx — Hot Games card rewrite:
      * Source Window → Select dropdown (30/60/90/120)
      * Hot Games Count → Select dropdown (3–10), label renamed from "Top Games Count"
      * Time Mapping → vertical rows, N rows where N = hot_games_count, time Select per row,
        row labels "Hot 1", "Hot 2", ..., inline red warning when not ascending, save blocked
      * Removed draft delay field; added "Drafts are created immediately after a scan" text
      * Added Frozen Snapshot notice at top explaining pinning behavior
      * Summary panel updated with first/last mapped times and snapshot note
      * migrateHotGames migrates old shape (top_games_count → hot_games_count,
        fixed_time_mapping → time_mapping, drops draft_delay_minutes)
      * setHotGamesCount dynamically resizes time_mapping array
    - src/components/posts/edit-post-modal.tsx — Hot Games snapshot banner: when a post
      has generation_context_json with type "hot_games_snapshot", shows amber info box
      with scan timestamp, source window, ranked games count, and note that refinement
      reuses the snapshot without scanning again
    - docs/04-automations.md — new config shape, dropdown caps, ascending mapping, immediate
      drafts, frozen snapshot behavior with example snapshot shape
    - docs/02-data-model.md — added Post.generation_context_json
    - docs/07-ai-boundaries.md — new Hot Games Frozen Snapshot section
  - New Hot Games field behavior:
    - Source Window: dropdown only (30/60/90/120), no free input
    - Hot Games Count: dropdown only (3–10)
    - Time Mapping: operator picks per rank, auto-resizes with count, ascending order enforced
  - Ascending-order warning behavior:
    - Per-row red "Times must be in ascending order." text to the right of offending row
    - handleSave blocks with error if any pair is not ascending
    - Zod schema has matching refine() for server-side validation
  - Snapshot freezing behavior:
    - Post.generation_context_json holds the snapshot { type, scan_timestamp,
      source_window_minutes, ranked_games, time_mapping }
    - Rules page prepares the architecture; actual snapshot write happens at scan-time
      (future AI/generation layer)
  - How Content Queue edits now reuse the same snapshot:
    - Edit modal detects generation_context_json.type === "hot_games_snapshot"
    - Shows a read-only banner with snapshot details and explicit note that refinement
      reuses the snapshot and will not trigger a new scan
  - Docs updated: 04-automations.md, 02-data-model.md, 07-ai-boundaries.md

- Task: Fix Add Rule button on On Going Promotions tab
  - Status: Complete
  - Root cause:
    The addPromoRule handler called crypto.randomUUID() to generate the new rule's id.
    crypto.randomUUID() is a secure-context-only browser API — it is only available on
    HTTPS or localhost. On the deployed server at http://34.92.70.250 (plain HTTP),
    the call threw "TypeError: crypto.randomUUID is not a function", which React
    swallowed silently in the onClick handler — so nothing happened when the operator
    clicked Add Rule. On localhost dev it worked because localhost is a secure context.
  - Files changed:
    - src/lib/client-id.ts (new) — generateClientId() helper. Tries crypto.randomUUID()
      when available, falls back to Date.now() + Math.random() combination for
      non-HTTPS environments. Safe in all contexts.
    - src/app/(app)/automations/page.tsx — imported generateClientId, replaced
      crypto.randomUUID() in addPromoRule handler
  - Verified: TypeScript passes clean. Add Rule will now work on both dev and deployed
    HTTP site. Existing server-side crypto.randomUUID() calls in API routes are
    unaffected (Node.js runtime always supports it).
  - Scope kept tight: no other changes, no schema changes, no other tabs touched.

- Task: Big Wins tab refinement — hourly check, AND/OR logic, custom-rule random usernames
  - Status: Complete
  - Files changed:
    - src/lib/validations/automation.ts — check_frequency now { interval_hours } only (removed
      time). draft_cadence renamed interval_hours → scan_delay_hours. default_rule adds
      logic: "OR" | "AND". Updated DEFAULT_BIG_WIN_RULE_CONFIG.
    - src/lib/username-mask.ts — added generateRandomUsername() (6–8 lowercase alphanumeric)
    - src/app/(app)/automations/page.tsx — Big Wins card updated:
      * Check Frequency: single hourly input + anchor rule helper text
      * Draft Creation Timing: label "Create draft after X hours from scan" (single delay)
      * Default Rule: new Condition logic dropdown (OR/AND), removed $ suffix from payout
      * Custom Rule: removed $ suffix from payout range fields
      * Username Display: removed Generate Sample button. Now shows two paths
        (default rule = source username masked, custom rule = random username masked)
      * Summary panel reflects new wording + default logic
      * migrateBigWin handles old config shape (interval_days/time → interval_hours)
    - docs/04-automations.md — updated config shape + rules to reflect all changes
  - New check frequency behavior:
    - Single "Check every N hours" input (1–168)
    - Anchor: cycle starts at 00:00:00 of rule creation day, repeats at selected interval
    - No separate time field anymore
  - New default rule logic selector:
    - OR (default): draft created if either payout OR multiplier condition is met
    - AND: draft created only if both conditions are met
  - New username behavior for custom rules:
    - Default rule drafts: source username, then masked
    - Custom rule drafts: fresh random username (6–8 chars, lowercase a-z + 0-9), then masked
    - generateRandomUsername() helper in src/lib/username-mask.ts
    - Single reusable maskUsername() still applies in both paths
  - Docs updated: docs/04-automations.md

- Task: Automation Rules — 3-tab page (Big Wins, On Going Promotions, Hot Games)
  - Status: Complete
  - Files changed:
    - src/lib/validations/automation.ts — added hot_games to rule types, expanded BigWinRuleConfig
      with check_frequency, draft_cadence, dedupe_key, content_output_rules. New schemas:
      OnGoingPromotionRuleConfig (check_schedule, promo_rules array, draft_delay) and
      HotGamesRuleConfig (check_schedule, source_window, fixed_time_mapping, sample_count)
    - src/app/api/automations/[id]/route.ts — validation branches for all 3 rule types
    - src/components/ui/checkbox-group.tsx (new) — extracted shared CheckboxGroup component
    - src/app/(app)/automations/page.tsx — full rewrite: 3 tabs with BigWinCard,
      OnGoingPromotionsCard, HotGamesCard. Each has enable toggle, config sections,
      summary panel, Content Queue Flow Notice, dirty detection, save/reset
    - src/app/(app)/events/new/page.tsx — import CheckboxGroup from shared
    - src/app/(app)/events/[id]/page.tsx — import CheckboxGroup from shared
    - docs/04-automations.md, docs/03-ui-pages.md, docs/02-data-model.md — updated
  - Tab structure:
    - Big Wins: API URL, check frequency (every N days + time), draft cadence (hours + sample count),
      default rule (OR logic), custom rule (ranges + display increase), username masking,
      content output rules, deduplication
    - On Going Promotions: API URL, weekly check schedule, Allow Duplicate Rules toggle,
      dynamic promo rules list (Add Rule → promo ID/name, posting mode, recurrence, sample count),
      draft delay
    - Hot Games: API URL, check schedule (Tue/Thu/Sat), source window (120 min), top 6 games,
      fixed time mapping (6-11 PM), 1 post per scan, draft delay (10 min), 2 samples, scan dedupe
  - Key notes:
    - hot_games added as new rule_type — auto-seeded on first brand access
    - running_promotion config migrated from legacy shape at render time
    - CheckboxGroup extracted to src/components/ui/ for reuse across events + automations
    - No Prisma schema changes — config_json handles all 3 shapes

- Task: Automation Rules page — Big Win focused rules configuration
  - Status: Complete
  - Files changed:
    - src/lib/username-mask.ts (new) — maskUsername() helper, first 2 + * middle + last 2
    - src/lib/validations/automation.ts — new BigWinRuleConfig schema (api_url, default_rule,
      custom_rule_enabled, custom_rule with payout/multiplier ranges + increase_pct).
      Old schemas kept for backward compat.
    - src/lib/display-value.ts (deleted) — superseded by new rule structure
    - src/app/api/automations/[id]/route.ts — removed value_display audit, added V2 validation
    - src/app/(app)/automations/page.tsx — full rewrite as "Automation Rules" page with
      6 sections: Big Win API, Default Rule, Custom Rule, Username Display, Rule Result
      Explanation, Content Queue Flow Notice. Only Big Win shown.
    - src/components/layout/sidebar.tsx — label "Automations" → "Automation Rules"
    - src/lib/audit.ts — AUTOMATION_VALUE_DISPLAY_CHANGED moved to legacy
    - docs/03-ui-pages.md, docs/04-automations.md, docs/02-data-model.md — updated
  - New page structure: 6 sections focused on Big Win rule configuration
  - Default rule: OR logic — draft created if payout ≥ threshold OR multiplier ≥ threshold
  - Custom rule: range-based with display increase %. Payout and multiplier sub-rules.
    Validation: min < max. Display adjustments only — source values unchanged.
  - Username masking: first 2 + * middle + last 2. ≤4 chars unchanged.
  - Rule explanation: live computed preview using current form values with sample win data
  - Content Queue flow: explicit notice that matched wins create drafts for review only
  - Key notes:
    - This is a rules config page only — no content generation, preview, or publishing
    - Running Promotion and Educational hidden from UI but data preserved in DB
    - Old config shape migrated at render time via migrateConfig()
    - No Prisma schema changes — config_json is Json type

- Task: Events date/time picker refinement — bounded time selection with proper defaults
  - Status: Complete
  - Scope: UI-only, create + edit event forms
  - Files changed:
    - src/components/events/event-datetime-picker.tsx (new) — shared EventDateTimePicker
      component with split date input + time Select dropdown. 96 time options (15-min intervals
      from 00:00 to 23:45, plus 23:59 for end mode). Exports DEFAULT_START_TIME ("00:00"),
      DEFAULT_END_TIME ("23:59"), splitDatetime(), joinDatetime() utilities.
    - src/app/(app)/events/new/page.tsx — replaced datetime-local inputs with
      EventDateTimePicker. FormData split into start_date/start_time and end_date/end_time.
      Start defaults to 00:00, end defaults to 23:59.
    - src/app/(app)/events/[id]/page.tsx — same replacement in edit mode. EditData and
      initEditData updated. saveEdit uses joinDatetime for ISO conversion.
  - How start time defaults: 00:00 (midnight) via DEFAULT_START_TIME constant
  - How end time defaults: 23:59 via DEFAULT_END_TIME constant
  - How bounded time picker works: Select dropdown with fixed options (15-min intervals),
    no infinite scroll. End mode adds 23:59 PM option. Min 00:00, max 23:59.

- Task: Events Module Upgrade — AI-ready campaign briefs + Content Queue integration
  - Status: Complete
  - Schema changes:
    - EventStatus enum: removed draft, kept active/ended/archived, default changed to active
    - Event model: added target_audience, cta, tone, platform_scope (Json), notes_for_ai,
      posting_instance_json (Json), auto_generate_posts (Boolean)
    - Post model: added source_instance_key (String?) for occurrence tracking
    - Migration: 20260418180000_event_campaign_brief (data-migrated draft→active before enum change)
  - New files:
    - src/lib/event-status.ts — normalizeEventStatus(), normalizeEvent(), normalizeEvents()
      with ARCHIVE_THRESHOLD_DAYS=14. Active→ended if past end_at, ended→archived if 14+ days past.
    - src/lib/posting-instance.ts — PostingInstanceConfig interface, formatPostingInstance(),
      formatPostingInstanceCompact(), formatPostingInstanceWithEnd(), parsePostingInstance(),
      generateOccurrences() with month-day clamping for edge cases
    - src/lib/event-brief-context.ts — EventBriefContext interface, resolveEventBriefContext()
      loads event from DB and formats context for AI refinement
    - src/app/api/events/[id]/generate-drafts/route.ts — POST creates shell Post records per
      occurrence × platform from posting schedule, deduplicates by source_instance_key + platform
    - src/app/api/posts/[id]/event-context/route.ts — GET returns EventBriefContext for a post
  - Modified files:
    - prisma/schema.prisma — EventStatus enum, Event model fields, Post.source_instance_key
    - src/lib/validations/event.ts — removed draft, added postingInstanceSchema, extended
      createEventSchema and updateEventSchema with campaign brief fields
    - src/lib/validations/post.ts — added source_instance_key to createPostSchema
    - src/lib/audit.ts — added EVENT_DRAFTS_GENERATED action
    - src/app/api/events/route.ts — normalizeEvents on GET, status: "active" on POST, new fields
    - src/app/api/events/[id]/route.ts — normalizeEvent on GET, new fields in PATCH audit
    - src/app/api/posts/route.ts — enriches event-sourced posts with event_posting_summary
      and event_title via batch event lookup
    - src/lib/events-api.ts — Event interface expanded, generateDrafts method added
    - src/lib/posts-api.ts — Post interface: source_instance_key, event_posting_summary,
      event_title; added getEventContext method and EventBriefContext type
    - src/app/(app)/events/page.tsx — removed draft from STATUS_COLORS
    - src/app/(app)/events/new/page.tsx — full rewrite as campaign brief form with 3 sections:
      Event Details, Campaign Brief (target_audience/cta/tone/platform_scope/notes_for_ai),
      Posting Schedule (frequency/time/weekday or month-day selection/preview summary)
    - src/app/(app)/events/[id]/page.tsx — full rewrite with Campaign Brief and Posting Schedule
      sections in view/edit mode, Generate Drafts button
    - src/app/(app)/queue/page.tsx — added Recurrence column showing event posting summary
    - src/app/(app)/queue/[id]/page.tsx — Source ID links to /events/[id] for event-derived posts,
      shows occurrence datetime
    - src/components/posts/edit-post-modal.tsx — detects event-derived posts, fetches event
      context, shows info banner with event title and constraint note
    - docs/00-architecture.md, docs/02-data-model.md, docs/03-ui-pages.md,
      docs/06-workflows-roles.md, docs/07-ai-boundaries.md — all updated
  - Event form structure: title, type, theme, dates, objective, rules, reward +
    campaign brief (target_audience, cta, tone, platform_scope, notes_for_ai) +
    posting schedule (daily/weekly/monthly with time + day selection)
  - Recurrence behavior: daily at time, weekly on selected weekdays at time,
    monthly on selected days (with month-day clamping) at time. Preview summary shown in form.
  - Event status lifecycle: active (default) → ended (past end_at) → archived (14+ days past).
    Normalization applied on API reads via shared utility.
  - Event-derived drafts: posts created via Generate Drafts with source_type=event,
    source_id=event.id, source_instance_key=occurrence ISO, post_type=event.
    One post per occurrence × platform.
  - Queue edit constraint: edit modal detects event-derived posts, fetches event brief context
    via /api/posts/[id]/event-context, shows info banner. Event rules and schedule cannot be
    changed from queue — only content refinement.
  - Deferred items:
    - Actual AI content generation (Generate Drafts creates shell posts, no AI calls)
    - Auto-generate cron job (auto_generate_posts flag stored but not wired to scheduler)
    - Edit modal "Apply Edit" remains placeholder for future AI refinement

- Task: Calendar Page refinement — visual distinction + detail dialog
  - Status: Complete
  - Scope: UI-only, single file changed
  - Files changed:
    - src/components/calendar/calendar-post-card.tsx — full rewrite with two improvements
  - How approved vs scheduled styling now differs:
    - Approved cards: emerald-green left border (3px week / 2px month), bg-emerald-500/5 tint,
      hover to bg-emerald-500/10. Status indicator shows CheckCircle2 icon + "Posted" label
      in emerald green.
    - Scheduled cards: amber left border (3px week / 2px month), bg-amber-500/5 tint,
      hover to bg-amber-500/10. Status indicator shows CalendarClock icon + "Scheduled" label
      in amber.
    - Both variants (detailed week cards and compact month cards) use the same color system
      via STATUS_CARD_STYLES config object.
  - How the calendar detail view works:
    - Clicking any calendar card opens a Dialog (shadcn) instead of navigating away.
    - Dialog shows: status indicator with icon, headline as title, thumbnail placeholder
      (ImageIcon), brand dot + name (in all-brands mode), platform badge (full name),
      post type label, posted/scheduled time with icon (green CheckCircle2 for approved,
      amber CalendarClock for scheduled), full caption, CTA, banner text.
    - Time formatting uses full readable format: "Fri, Apr 18, 2026, 10:30 AM".
    - "Open full detail" button at bottom navigates to /queue/[id] for full editing/actions.
  - Key notes:
    - No backend changes
    - No layout, filter, or navigation changes
    - Dialog uses existing shadcn Dialog component
    - Each card manages its own dialog open state via useState

- Task: Calendar Page — visual planner for approved + scheduled posts
  - Status: Complete
  - Scope: Backend extension + full calendar frontend (no external calendar library)
  - Files changed:
    - src/lib/validations/post.ts — added statuses (comma-separated), date_from, date_to params
      to listPostsQuerySchema; raised per_page max from 100 → 200
    - src/app/api/posts/route.ts — multi-status filter (status: { in: [...] }), date range OR
      filter (approved → posted_at/updated_at, scheduled → scheduled_at), added primary_color
      to brand select
    - src/lib/posts-api.ts — extended BrandRef with primary_color, PostFilters with statuses/
      date_from/date_to, updated buildPostsUrl
    - src/lib/calendar-utils.ts (new) — getWeekRange, getMonthRange, getDaysInRange,
      getPostDate, groupPostsByDate, formatCardTime, isToday, isSameMonth, formatDateRangeLabel
    - src/components/calendar/calendar-post-card.tsx (new) — detailed (week) and compact (month)
      variants; shows time, platform tag, status badge, brand dot + name (all-brands mode),
      headline/caption truncated; click navigates to /queue/[id]
    - src/components/calendar/calendar-week-view.tsx (new) — 7-column CSS grid (Mon–Sun),
      day header with today highlight (primary circle), scrollable columns, min-h-[500px]
    - src/components/calendar/calendar-month-view.tsx (new) — 7-column month grid, min-h-[120px]
      cells, compact cards, +N more overflow button with expand/collapse, outside-month muting
    - src/app/(app)/calendar/page.tsx — full rewrite from stub; week/month toggle, prev/next/today
      navigation, date range label, 3 filters (platform, post_type, status), data fetching via
      TanStack Query, loading/error/empty states
  - How approved vs scheduled posts are handled:
    - "approved" = already posted; calendar shows posted_at time (falls back to updated_at if null)
    - "scheduled" = future posting; calendar shows scheduled_at time
    - API date range filter uses OR clause mapping each status to its relevant date field
    - Status filter on calendar only offers: All, Approved (Posted), Scheduled
  - How All Brands mode behaves:
    - Shows posts from all accessible brands
    - Each card displays brand color dot (uses primary_color from Brand, falls back to
      deterministic hash) + brand name
    - Single brand mode hides brand info on cards
  - How platform icons and timestamps are rendered:
    - Platform: compact 2-letter abbreviation tags (IG/FB/TW/TK/TG) with platform-specific colors
    - Timestamps: formatted as "10:30 AM" style using native Date.toLocaleTimeString
    - Week view: detailed cards with time, platform, status, brand, headline
    - Month view: single-line compact cards with time + platform + headline snippet
  - Key notes:
    - No external calendar library — custom CSS grid with Tailwind
    - No drag-and-drop
    - No new Prisma schema changes
    - Backend changes are backward-compatible (existing queue page unaffected)
    - Calendar uses separate query key ["calendar-posts"] to avoid cache conflicts with queue

### 2026-04-15
- Task: Content Queue — table refactor + prompt-based edit modal
  - Status: Complete
  - Scope: UI-only, no backend changes
  - Files changed:
    - src/components/posts/status-badge.tsx — added per-status lucide icons (FileEdit, Clock,
      CheckCircle2, CalendarClock, SendHorizontal, XCircle, AlertTriangle); badge now renders
      icon + label with gap-1 whitespace-nowrap
    - src/components/posts/edit-post-modal.tsx (new) — Dialog showing current content sections
      (Headline, Caption, CTA, Banner Text, Image Prompt), instruction textarea, "Apply Edit"
      button (placeholder — AI logic wired in a future step); shows feedback message on apply
    - src/app/(app)/queue/page.tsx — full table rewrite:
        • Column order: Brand (all-brands only) | Thumbnail | Preview | Status | Type | Platform
          | Scheduled | Created | Actions
        • ThumbnailCell: 40×40 rounded square, platform abbreviation + color (IG/FB/TW/TK/TG)
        • Preview: headline (bold) + caption (muted) truncated; creator name as tertiary line
        • StatusBadge: now includes icon (imported from updated status-badge.tsx)
        • PostTypeTag: compact colored border badge (Promo/Win/Event/Edu)
        • PlatformTag: compact 2-letter abbreviation with platform color
        • BrandCell: deterministic color dot per brand name + truncated name
        • Scheduled: "Today, 2:30 PM" / "Tomorrow, 2:30 PM" / "Apr 12, 2:30 PM" / "—"
        • Created: short date (Apr 12), xs size, lower opacity; hidden on xs screens
        • Actions: View (Eye), Edit (Pencil, draft/pending/rejected), Approve (✓), Reject (✗),
          Schedule (CalendarClock) — same role/status guards as before
        • EditPostModal wired: clicking Edit sets editPost state, modal opens over the table
        • Table: overflow-x-auto + min-w-[860px], responsive hidden columns on mobile
  - Key notes:
    - Edit modal "Apply Edit" is a placeholder — instruction is shown as saved but no API call
    - Thumbnail uses platform color/abbr as visual placeholder (no image_url on Post type yet)
    - Brand dot color is deterministic hash of brand name (no primary_color in BrandRef)
    - No backend changes — all changes are UI-only


- Task: UI Refinement Batch 1 — Global UI + Brand Switch polish
  - Status: Complete
  - Changes:
    - src/app/layout.tsx — switched font from Geist to Roboto (300/400/500/700 weights,
      --font-roboto CSS variable via next/font/google)
    - src/app/globals.css — full theme update to Meta Business Suite palette:
        • primary → oklch(0.52 0.22 258) ≈ #1877F2 (Facebook blue) with white foreground
        • muted/secondary → oklch(0.962 0.004 260) ≈ #F0F2F5 (Facebook light gray)
        • border/input → oklch(0.899 0.004 260) ≈ #DADDE1 (subtle gray border)
        • ring → blue (matches primary)
        • --font-sans mapped to --font-roboto
        • radius reduced to 0.5rem (slightly tighter)
    - src/components/layout/shell.tsx — converted to client component; manages
      sidebarOpen state; renders mobile backdrop overlay
    - src/components/layout/sidebar.tsx — responsive: fixed+translate-x on mobile
      (slides in/out), md:relative always visible on desktop; nav links close sidebar on mobile
    - src/components/layout/topbar.tsx — added onMenuClick prop; hamburger Menu button
      visible only on mobile (md:hidden) in top-left
    - src/app/(app)/queue/page.tsx — wrapped table in overflow-x-auto + min-w-[720px]
      to prevent column squishing on narrow viewports
    - src/app/(app)/events/page.tsx — same pattern, min-w-[560px]
  - Brand dropdown: no changes needed — correctly implemented in previous session
    (fetches from /api/brands, cookie-based active brand, All Brands mode, query invalidation)

- Task: All Brands mode — default dashboard view + per-brand optional selection
  - Status: Complete
  - Architecture:
    - Cookie value "all" = all-brands mode; specific brand_id = single-brand mode
    - On login / missing cookie → defaults to "all"
    - Invalid brand_id in cookie → falls back to "all"
    - getActiveBrand() now always returns ActiveBrandContext (never null)
    - ctx.brandIds: admin = all active brands, others = UserBrandPermission records
    - Read routes: filter by brand_id: { in: ctx.brandIds } (works for both modes)
    - Write routes: require ctx.mode === "single" → REQUIRES_SINGLE_BRAND (409)
    - ctx.brand! non-null assertion safe after mode guard (TypeScript pattern)
  - Files changed:
    - src/lib/active-brand.ts — new ActiveBrandContext type, getActiveBrand always returns context
    - src/lib/active-brand-client.ts — new useActiveBrand() hook (shares ["active-brand"] query key)
    - src/lib/api.ts — REQUIRES_SINGLE_BRAND error added
    - src/lib/posts-api.ts — Post.brand?: BrandRef added; PostsPage.mode? added
    - src/lib/events-api.ts — Event.brand?: EventBrandRef added; EventsPage.mode? added
    - src/app/api/brands/active/route.ts — GET returns { mode, brand }; POST accepts "all"
    - src/app/api/posts/route.ts + [id]/route.ts + approve/reject/schedule — brandIds + mode guard
    - src/app/api/events/route.ts + [id]/route.ts — brandIds + mode guard
    - src/app/api/channels/route.ts + [id]/route.ts — brandIds + mode guard; GET includes brand
    - src/app/api/automations/route.ts — all-brands mode skips seeding, queries across brandIds
    - src/app/api/automations/[id]/route.ts — mode guard
    - src/app/api/templates/route.ts + [id]/route.ts — brandIds in OR filter for globals; mode guard
    - src/app/api/audit-logs/route.ts — brandIds filter
    - src/app/api/insights/route.ts — brandIds across all queries
    - src/components/layout/topbar.tsx — "All Brands" as first option, Layers icon, mode-aware display
    - src/app/(app)/queue/page.tsx — brand column in all-brands mode, dead isNoBrand removed
    - src/app/(app)/events/page.tsx — brand column + disabled "New Event" in all-brands mode
  - Key notes:
    - Automations seeding skipped in all-brands mode (can't seed across N brands at once)
    - Templates global OR filter: brand_id IN brandIds OR brand_id IS NULL
    - useActiveBrand() uses staleTime 30s and shares cache with topbar — no extra fetch

- Task: Brand dropdown — strict DB source, active brand display, auto-select, query sync
  - Status: Complete
  - Files changed:
    - src/app/api/brands/active/route.ts — added GET handler: reads cookie, validates
      brand is active + user has access, returns { id, name, primary_color } or null
    - src/components/layout/topbar.tsx — full refactor:
        • queries ["active-brand"] via GET /api/brands/active (staleTime 30s)
        • button shows active brand name (with color dot) instead of always "Select Brand"
        • dropdown highlights selected brand with bg-muted + Check icon
        • auto-selects the only brand on first load (useRef guard prevents loop)
        • detects if active brand is no longer in accessible list → switches to first brand
        • on switch: invalidates ["active-brand"] immediately, marks all queries stale,
          calls router.refresh() for server components
        • "Loading..." shown briefly while active-brand query is settling
    - src/app/(app)/brands/page.tsx — invalidate() now also invalidates
      ["brands-switcher"] and ["active-brand"] so topbar updates after brand create/edit
  - Data source: GET /api/brands?active=true — admin sees all active brands, non-admin
    sees only brands they have a UserBrandPermission record for
  - No schema changes, no new tables


- Task: VPS Deployment — Ubuntu + PM2 + Nginx + Cloudflare
  - Status: Deployment config complete. Awaiting live VPS credentials to execute.
  - Architecture: Ubuntu VPS / Node.js 22 LTS / PM2 / Nginx (port 80) / Cloudflare Flexible SSL
  - Files created and committed:
    - `.env.production.example` — env template (force-added past .gitignore)
    - `ecosystem.config.js` — PM2 app config, app at /opt/mkt-agent port 3000
    - `nginx/mkt-agent.conf` — reverse proxy; passes X-Forwarded-Proto from Cloudflare
    - `scripts/server-setup.sh` — one-time Ubuntu bootstrap (Node, PM2, Nginx, clone, firewall)
    - `scripts/deploy.sh` — git pull + npm install + prisma generate + migrate deploy + build + pm2 reload
  - Required env vars on server:
    - DATABASE_URL — Neon connection string
    - AUTH_SECRET — openssl rand -base64 32
    - AUTH_TRUST_HOST=true
    - NODE_ENV=production
  - Cloudflare DNS: A record dev → VPS IP, orange cloud proxied, SSL/TLS mode: Flexible
  - App directory on server: /opt/mkt-agent
  - PM2 process name: mkt-agent
  - Key notes:
    - src/generated/prisma is gitignored — prisma generate MUST run before every build
    - proxy.ts already handles x-forwarded-host + x-forwarded-proto (Cloudflare-safe)
    - trustHost: true is already set in src/auth.ts
    - bootstrap: curl .../scripts/server-setup.sh | bash (once on fresh server)
    - redeploy: cd /opt/mkt-agent && bash scripts/deploy.sh
  - Next: SSH into VPS and run bootstrap + deploy when credentials available

### 2026-04-14
- Task: Brand Management module (replaces Brand Settings)
  - Status: Complete
  - Notes: Merged Brand Settings into a new admin-level Brand Management module.
    Schema: Added secondary_color, accent_color, integration_settings_json, voice_settings_json,
    design_settings_json, sample_captions_json to Brand model. Legacy settings_json kept for compat.
    Migration applied: 20260414151327_brand_management.
    Validations in src/lib/validations/brand.ts: brandIdentitySchema, integrationSettingsSchema,
    voiceSettingsSchema (with tone, language_style replacing old app_link fields), designSettingsSchema,
    sampleCaptionSchema. createBrandSchema / updateBrandSchema combine all sections.
    Removed fields: signup_endpoint, deposit_endpoint, revenue_endpoint (never existed), app_link_ios/android/web
    (removed from voice — not in new spec).
    Audit actions added: BRAND_CREATED, BRAND_UPDATED, BRAND_ACTIVATED, BRAND_DEACTIVATED,
    BRAND_INTEGRATION_CHANGED (legacy BRAND_SETTINGS_UPDATED kept for existing log entries).
    API: GET /api/brands (all roles — admin sees all, others see accessible brands; used by topbar switcher);
    POST /api/brands (admin only); GET /api/brands/[id] (admin only); PATCH /api/brands/[id] (admin only).
    Note: /api/brands/active routes unchanged (cookie management).
    Client helper: src/lib/brands-api.ts — list, get, create, update.
    Page: src/app/(app)/brands/page.tsx — brand list with search + active/inactive filter. Each card
    shows name, status badge, domain, API base URL, integration badge, color swatches, last updated.
    "Add Brand" / "Edit" open a tabbed dialog with 5 sections: Identity, Integration, Voice & Tone,
    Design, Sample Captions. Admin-only writes; list visible to all.
    Topbar: PLACEHOLDER_BRANDS removed; now fetches real brands via brandsApi.list({ active: "true" }).
    Brand switcher shows color dot per brand.
    Nav: "Brand Settings" → "Brand Management", route /brand-settings → /brands.
    Deleted: src/app/(app)/brand-settings/, src/app/api/brand-settings/, src/lib/brand-settings-api.ts,
    src/lib/validations/brand-settings.ts.
    TypeScript clean (also fixed pre-existing trigger prop type errors in reject-dialog + schedule-dialog).
    Docs updated: CLAUDE.md, docs/02-data-model.md, docs/03-ui-pages.md, docs/06-workflows-roles.md.
  - API surface:
    - GET    /api/brands         — list accessible brands (all roles)
    - POST   /api/brands         — create brand (admin only)
    - GET    /api/brands/[id]    — get full brand record (admin only)
    - PATCH  /api/brands/[id]    — update brand (admin only)
  - Key notes:
    - Admin creates/edits brands; brand_manager/operator/viewer are read-only on this module
    - integration_settings_json replaces entire blob on PATCH (not deep-merged)
    - voice_settings_json and design_settings_json same — full replacement per section
    - sample_captions_json is an array; each item has a client-generated id for list management
    - No live API sync, test connection, or secrets management in this MVP iteration

### 2026-04-12
- Task: Add rejected_reason to Post
  - Status: Complete
  - Notes: Added rejected_reason (String?) to Post model in schema.prisma; ran prisma generate.
    Reject route (src/app/api/posts/[id]/reject/route.ts): now writes rejected_reason directly
    instead of prefixing cta with "[Rejected] reason".
    posts-api.ts Post interface: added rejected_reason: string | null.
    Post detail page (queue/[id]/page.tsx): removed parseRejectionReason() helper and REJECT_PREFIX
    constant entirely; rejection reason banner now reads post.rejected_reason directly; CTA field
    displays post.cta without any special-casing; PostPreview overrideCta prop removed.
    TypeScript passes clean. No other logic changed.

- Task: Audit Logs & Final Polish
  - Status: Complete
  - Notes: GET /api/audit-logs — brand-scoped, paginated (50/page), filterable by action,
    entity_type, date_from, date_to (ISO date strings; date_to is extended to end-of-day).
    All roles can read their accessible brand's logs.
    Client helper in src/lib/audit-logs-api.ts: list(params).
    Audit Logs page (src/app/(app)/audit-logs/page.tsx): filter bar (action select, entity_type
    select, date range inputs), Apply/Clear buttons, entry count. Table rows show timestamp
    (Asia/Manila), user name, action badge (color-coded by category), entity_type, entity_id.
    Expandable detail rows (click to expand) show before/after JSON in side-by-side panels.
    Loading skeleton, empty state, no-active-brand state.
    TypeScript fix: shadcn Select onValueChange types v as string|null — guarded with !v check.

  - Permission audit (final):
    - All routes: auth() + sessionUser() → 401 if unauthenticated ✓
    - All routes: getActiveBrand() → 403 if no active brand or no permission ✓
    - Read endpoints (GET): all roles allowed; no additional guard needed ✓
    - Create/Edit (posts, events): assertCanEdit() — viewer blocked ✓
    - Approve/Reject/Schedule: assertCanApprove() — only brand_manager+ ✓
    - Channels/Automations/BrandSettings/Templates (write): assertCanApprove() ✓
    - Post edits: status guard enforced (draft/rejected only) ✓
    - Post schedule: future-only validation enforced ✓
    - Status transitions: isValidTransition() enforced on approve/reject/schedule ✓

  - Multi-brand audit (final):
    - All DB queries filter by brand_id: ctx.brand.id (resolved from cookie, not from client) ✓
    - getActiveBrand validates cookie → DB → user permission — admin bypasses permission table ✓
    - Templates: global templates (brand_id=null) are returned on read, immutable via API ✓
    - Audit logs, insights, channels, events, automations all use ctx.brand.id ✓
    - No cross-brand leaks found ✓

  - API surface:
    - GET /api/audit-logs  — brand-scoped, paginated audit log (all roles)

  - Key notes:
    - Viewer role is fully read-only — no UI mutation paths exist outside the gated components
    - Operator can create posts and events but cannot approve/reject/schedule
    - brand_manager can do everything except cross-brand access (that's admin only)
    - Global templates can only be seeded via DB migration — no API write path

- Task: Templates & Assets module
  - Status: Complete
  - Notes: No schema changes — Template model was already correct (brand_id nullable, template_type
    String, name, active, config_json, created_at, updated_at).
    Validation in src/lib/validations/template.ts: TEMPLATE_TYPES (caption|banner|prompt|cta|asset),
    ASSET_TYPES (image|logo|banner), textTemplateConfigSchema (content + notes),
    assetConfigSchema (url + asset_type + notes), createTemplateSchema (discriminatedUnion on
    template_type), updateTemplateSchema, listTemplatesQuerySchema.
    Three audit actions added to audit.ts: TEMPLATE_CREATED, TEMPLATE_UPDATED, TEMPLATE_TOGGLED.
    API: GET /api/templates (brand + optional global, filterable by type/active);
    POST /api/templates (brand_manager+, creates for active brand);
    GET /api/templates/[id] (all roles, brand or global);
    PATCH /api/templates/[id] (brand_manager+, own-brand only — global templates read-only,
    config merged/validated against existing template_type).
    Client helper in src/lib/templates-api.ts: list, get, create, update.
    Templates & Assets page (src/app/(app)/templates/page.tsx): tab navigation (Captions,
    Banner Text, Image Prompts, CTA Snippets, Assets) with per-tab count badges.
    Each tab: grid of TemplateCards, TemplateFormDialog for create/edit, inline
    activate/deactivate toggle. Duplicate button available to all roles (operator+).
    Global templates shown with "Global" badge and no edit/toggle controls.
    Inactive templates shown with "Inactive" badge and reduced opacity.
    TypeScript passes clean (Zod v4 fix: z.record(z.string(), z.unknown()), z.boolean().default()).
  - API surface:
    - GET    /api/templates      — list templates (brand + global, all roles)
    - POST   /api/templates      — create template (brand_manager+)
    - GET    /api/templates/[id] — get single template (all roles)
    - PATCH  /api/templates/[id] — update template (brand_manager+, own-brand only)
  - Key notes for next session:
    - Global templates (brand_id = null) are read-only in the API — seed them via DB migration only
    - Duplicate in UI pre-fills the create form with the source template's content; saves as a new
      brand-scoped template (not a copy of global)
    - No delete endpoint — deactivate via active toggle to preserve audit trail
    - template_type is immutable after creation (enforced: PATCH does not accept template_type)
    - Next step: Audit Logs & Final Polish (Step 10 of build order)

- Task: Lightweight Insights module
  - Status: Complete
  - Notes: No new schema changes required — PostMetricsRollup, ClickEvent, SignupEvent,
    DepositEvent, and RevenueEvent were already in the schema.
    GET /api/insights?period= (today | last_7_days | last_30_days) — all roles, brand-scoped.
    Operational metrics (generated/approved/rejected/published) queried from Post table filtered
    by created_at in period. Attribution metrics (clicks, signups, depositors, total_deposit,
    total_ggr) aggregated from raw event tables filtered by created_at in period. Depositors
    computed via groupBy(user_id) to get unique count. Top content (top 5 by clicks, deposit, GGR)
    pulled from PostMetricsRollup — all-time, brand-scoped (rollup is cumulative, no period filter).
    Decimal type used structural typing ({ toFixed }) to avoid runtime library import issues.
    Client helper in src/lib/insights-api.ts: get(period).
    Insights page (src/app/(app)/insights/page.tsx): period selector dropdown in header,
    Operational section (4 metric cards), Attribution section (5 metric cards with currency
    formatting in ₱), Top Content section (3 tables: by clicks, deposit, GGR). Loading skeleton,
    no-active-brand state, generic error state. TypeScript passes clean.
  - API surface:
    - GET /api/insights?period=  — brand-scoped insights (all roles)
  - Tightened 2026-04-12:
    - Time boundaries: all period calculations now use Asia/Manila UTC+8 midnight alignment.
      Periods use gte/lt (inclusive start, exclusive end) consistently.
    - Depositors/deposit/GGR: now filter by status="success" only. status field added to
      DepositEvent and RevenueEvent (String @default("success"), values: success | reversed).
    - Indexes added: ClickEvent/SignupEvent @@index([brand_id, created_at]);
      DepositEvent/RevenueEvent @@index([brand_id, created_at]) + @@index([brand_id, status, created_at]);
      PostMetricsRollup @@index([brand_id]).
    - Top content section labeled "All-time (cumulative)" in UI.
    - rollup_last_updated (ISO string) returned in API response; displayed as "Last updated: …" in UI.
    - top_limit query param added (default 5, max 20) for forward-compatible expansion.
    - period_start/period_end (ISO) returned in API response for client-side debug/verification.
  - Key notes for next session:
    - Operational metrics use created_at for time filtering — not a true state-change timestamp
      (e.g. a post created in period but approved later still counts as approved in that period)
    - Top content is all-time — rollup table has no per-event timestamp
    - No scheduled rollup job yet — PostMetricsRollup must be written by the publishing pipeline
    - Attribution data will be zero until click/signup/deposit events are actually ingested
    - Next step: Templates & Assets (Step 9 of build order)

- Task: Brand Settings module
  - Status: Complete
  - Notes: Added settings_json (Json @default("{}")) to Brand schema; ran prisma generate.
    Updated active-brand.ts to select settings_json and include it in ActiveBrandContext.
    Validation schemas in src/lib/validations/brand-settings.ts: updateBrandCoreSchema,
    brandVoiceSchema (cta_style, taglish_ratio, emoji_level, banned_phrases, default_hashtags,
    app_link_ios/android/web), DEFAULT_BRAND_VOICE, updateBrandSettingsSchema.
    API: GET /api/brand-settings (all roles, re-fetches full brand record);
    PATCH /api/brand-settings (brand_manager+, merges voice into settings_json, coerces
    empty strings to null for optional URL/color fields). Audit action BRAND_SETTINGS_UPDATED.
    Client helpers in src/lib/brand-settings-api.ts: get, update.
    Brand Settings page (src/app/(app)/brand-settings/page.tsx): three SectionCard panels —
    Brand Identity (name, logo_url, primary_color, domain), App Links (ios/android/web),
    Voice & Content Defaults (CTA style, Taglish ratio, emoji level, default_hashtags, banned_phrases).
    Per-section save/reset with dirty detection. TagInput component for arrays. ColorField
    for hex color with native color picker. Viewer/operator read-only; brand_manager/admin edits.
    TypeScript passes clean (prisma generate resolved settings_json type errors).
  - API surface:
    - GET   /api/brand-settings  — get active brand settings (all roles)
    - PATCH /api/brand-settings  — update core fields and/or voice settings (brand_manager+)
  - Key notes for next session:
    - settings_json is a Json column — voice settings are merged (partial update), not replaced
    - assertCanApprove gates PATCH (same as other brand_manager+ routes)
    - DEFAULT_BRAND_VOICE in validations/brand-settings.ts is the canonical fallback
    - Next step: Lightweight Insights (Step 8 of build order)

- Task: Channels module
  - Status: Complete
  - Notes: Added last_sync_at (DateTime?) and last_error (String?) as proper columns to the
    Channel schema — not in config_json, since they are first-class operational fields.
    Three audit actions: channel.created, channel.updated, channel.status_changed (written as
    a separate entry when status changes in a single PATCH, same pattern as events).
    Validation schemas in src/lib/validations/channel.ts: PLATFORMS/CHANNEL_STATUSES/labels
    match Prisma enums exactly. createChannelSchema / updateChannelSchema. Platform is not
    editable after creation — changing it would mean a different account entirely.
    API: GET /api/channels (brand-scoped, ordered by platform then account_name);
    POST /api/channels (brand_manager+); GET+PATCH /api/channels/[id] (brand_manager+ for writes).
    notes stored in config_json.notes — the only free-text config field for MVP.
    Channels page: grouped by platform, card layout, status badge with icon, last_sync_at
    and last_error displayed when present, Create dialog + Edit dialog (inline, no separate page).
    Operator/viewer sees read-only list; brand_manager/admin sees Add Channel + Edit buttons.
    TypeScript passes clean.
  - API surface:
    - GET    /api/channels       — list channels for active brand
    - POST   /api/channels       — create channel (brand_manager+)
    - GET    /api/channels/[id]  — get single channel
    - PATCH  /api/channels/[id]  — update channel (brand_manager+)
  - Key notes for next session:
    - platform is immutable after creation (enforced in UI; API does not accept platform in PATCH)
    - last_sync_at and last_error are DB columns — future publishing jobs write there directly
    - No OAuth, token refresh, or live API integration — deferred out of MVP scope
    - CHANNEL_CONNECTED / CHANNEL_DISCONNECTED in audit.ts are now superseded by
      CHANNEL_CREATED / CHANNEL_STATUS_CHANGED — the old constants can be cleaned up later
    - Next step: Lightweight Insights (Step 8 of build order)


- Task: Automations module
  - Status: Complete
  - Notes: Three audit actions added (automation.created, automation.updated,
    automation.value_display_changed — written as separate entries when a single PATCH changes
    both fields and value_display in big_win).
    Config types + schemas in src/lib/validations/automation.ts: explicit typed interfaces for
    RunningPromotionConfig, BigWinConfig, EducationalConfig, ValueDisplayConfig. Per-rule Zod
    schemas validate each config on write. computeDisplayValue + formatDisplayValue utility
    functions for the live preview UI.
    GET /api/automations seeds three default AutomationRule records (running_promotion, big_win,
    educational) on first access for a brand — idempotent, brand-scoped.
    PATCH /api/automations/[id] merges config_json fields (preserves existing unset keys),
    enforces brand_manager+ via assertCanApprove.
    Automations page: three cards (RunningPromotionCard, BigWinCard, EducationalCard), each with
    local edit state, per-card Save/Reset, dirty detection. BigWinCard includes full Value Display
    Rules section with display mode, adjustment type/value, max adjustment %, approval toggle,
    and a live preview showing source → display value transformation on sample $5,432.
    Auto-post toggle is disabled when approval_required is true (logically exclusive).
    Viewer + operator see settings read-only; brand_manager/admin can edit.
    TypeScript passes clean.
  - API surface:
    - GET   /api/automations       — list rules for active brand (seeds defaults if empty)
    - PATCH /api/automations/[id]  — update rule (brand_manager+)
  - Key notes for next session:
    - config_json is a merged object — partial PATCH only, existing keys are preserved
    - value_display lives inside big_win config_json.value_display
    - AUTOMATION_VALUE_DISPLAY_CHANGED fires only when value_display subkey changes
    - Hot games + engagement automations are out of MVP scope
    - Next step: Channels (Step 7 of build order)


- Task: Events module
  - Status: Complete
  - Notes: Three new audit actions added (event.created, event.updated, event.status_changed).
    Validation schemas in src/lib/validations/event.ts: createEventSchema, updateEventSchema,
    listEventsQuerySchema. EVENT_TYPES/EVENT_STATUSES/EVENT_TYPE_LABELS exported from there
    so all pages share the same values.
    Client helpers in src/lib/events-api.ts: list, get, create, update.
    API routes: GET+POST /api/events (brand-scoped, paginated, search+status+event_type filters);
    GET+PATCH /api/events/[id] (brand-scoped, assertCanEdit guards write operations).
    Permission: viewer = read-only; operator/brand_manager/admin can create+edit.
    Status transition tracked with separate EVENT_STATUS_CHANGED audit action when status changes.
    Frontend pages: events list (filters, pagination, no-active-brand state),
    new event form (structured form with all fields, client-side validation),
    event detail/edit page (inline edit mode, two-column layout, metadata sidebar).
    TypeScript passes clean.
  - API surface:
    - GET    /api/events         — list events (brand-scoped, filterable, paginated)
    - POST   /api/events         — create event (operator+)
    - GET    /api/events/[id]    — get single event (all roles)
    - PATCH  /api/events/[id]    — update event (operator+)
  - Key notes for next session:
    - event_type is a free string in DB — EVENT_TYPES in validations/event.ts is the canonical list
    - No linked posts generation or AI event generation — deferred to later steps
    - No winner selection logic — out of MVP scope
    - Next step: Automations (Step 6 of build order)

### 2026-04-10
- Task: Content Queue frontend + Post Detail / Preview
  - Status: Complete
  - Notes: Client-side API helpers in src/lib/posts-api.ts (list, get, update, approve, reject,
    schedule). StatusBadge with per-status colors. RejectDialog with optional reason (500 char),
    ScheduleDialog with datetime-local picker and future-only validation.
    Content Queue page (src/app/(app)/queue/page.tsx): status/platform/post_type filter selects,
    paginated post table, per-row inline approve/reject/schedule actions gated by role
    (admin/brand_manager can approve). No-active-brand and error states handled.
    Post Detail page (src/app/(app)/queue/[id]/page.tsx): full field display, inline edit mode
    for draft/rejected posts (headline, caption, CTA, banner text, image prompt), approve/reject/
    schedule action buttons, simple visual preview panel, source+tracking panel, metadata panel.
    TypeScript passes clean.
  - Key notes for next session:
    - Filter labels in queue/page.tsx use DB enum values from validations/post.ts
      (promo, big_win, event, educational / instagram, facebook, twitter, tiktok, telegram)
    - Rejection reason is stored in the `cta` field temporarily — add a dedicated DB column later
    - PLACEHOLDER_BRANDS in topbar.tsx still needs real data (brand step)
    - Next step: Events (Step 5 of build order)


- Task: Multi-brand context + Content Queue backend
  - Status: Complete
  - Notes: Cookie-based active brand resolution (active_brand_id, 30-day httpOnly cookie).
    getActiveBrand() in lib/active-brand.ts: reads cookie → validates brand active → checks
    user permission (admin bypasses permission table). All post routes enforce brand_id from
    the resolved context — frontend brand_id is never trusted.
    Post status machine in lib/post-status.ts with isValidTransition(); invalid transitions
    return 422. Permission guards via assertCanEdit / assertCanApprove in lib/api.ts.
    Audit log wired for: post.created, post.updated, post.approved, post.rejected, post.scheduled.
    Brand switcher in topbar now calls POST /api/brands/active and refreshes the router.
    Sign Out wired to signOut({ callbackUrl: "/login" }). Session user name shown in menu.
  - API surface:
    - POST   /api/brands/active         — set active brand cookie
    - DELETE /api/brands/active         — clear cookie
    - GET    /api/posts                 — list posts (brand-scoped, filterable, paginated)
    - POST   /api/posts                 — create draft
    - GET    /api/posts/[id]            — fetch single post
    - PATCH  /api/posts/[id]            — update fields (draft/rejected only)
    - POST   /api/posts/[id]/approve    — pending_approval → approved
    - POST   /api/posts/[id]/reject     — pending_approval → rejected
    - POST   /api/posts/[id]/schedule   — approved → scheduled
  - Key notes for next session:
    - PLACEHOLDER_BRANDS in topbar.tsx must be replaced with real DB data in brand step
    - Rejection reason stored in cta field for now; add dedicated column if needed later
    - lib/api.ts has shared Errors/ok/sessionUser helpers — use for all new routes
    - lib/active-brand.ts is the single entry point for brand resolution — do not bypass it
    - Next step: Content Queue frontend (Step 4 of build order)

- Task: Data Model & Auth
  - Status: Complete
  - Notes: Expanded Prisma schema to full MVP core — 11 additional tables, 4 new enums (PostType,
    Platform, SourceType added alongside existing ones). Added password_hash to User model.
    Set up NextAuth v5 (beta.30) with credentials provider; JWT sessions; session callbacks
    extend token/session with user id and role. Route handler at api/auth/[...nextauth].
    Auth proxy (Next.js 16 uses proxy.ts instead of middleware.ts) redirects unauthenticated
    users to /login. Login page at /login — plain HTML form, no shell.
    Route groups: (app)/ gets Shell layout; login/ is bare.
    Permission helpers at src/lib/permissions.ts: getUserBrandRole, canAccessBrand, canApprove,
    canEdit, canManageSettings, isAdmin. TypeScript clean. Smoke test: / → 307 /login, /login → 200.

- Task: Foundation & Setup — Next.js app shell
  - Status: Complete
  - Notes: Initialized Next.js 16 App Router with TypeScript, Tailwind v4, shadcn/ui (base-ui variant).
    Installed TanStack Query v5, TanStack Table v8, React Hook Form v7, Zod, Prisma 7 + pg adapter.
    Desktop layout: TopBar with brand switcher placeholder, Sidebar with all 11 nav items.
    Stub pages for all 10 routes. Prisma starter schema (Brand, User, UserBrandPermission + enums).
    TypeScript passes clean. Dev server responds 200 on all routes.
