// AI content generator — normalized input + output shapes.
//
// Architecture boundary: everything the generator needs to produce sample
// drafts lives in `NormalizedGenerationInput`. Source adapters (live or
// fixture) are responsible for lifting raw facts into this shape, so the
// prompt builder and orchestrator never branch on raw source differences.
//
// Source-of-truth for context precedence (see resolve-context.ts):
//   Brand Management (base) → Event brief (override, when event-derived)
// All generation code consumes the merged `effective` context; raw
// `brand` and `event` blocks are carried for audit/snapshot only.

import type { Platform, PostType } from "@/generated/prisma/enums";
import type {
  VoiceSettings,
  DesignSettings,
  SampleCaption,
} from "@/lib/validations/brand";
import type { AssetType } from "@/lib/validations/template";
import type {
  BrandVisualDefaultsInput,
  EventVisualOverrideInput,
} from "@/lib/ai/visual/validation";
import type { CompiledVisualPrompt } from "@/lib/ai/visual/types";
import type { BackgroundImageResult } from "@/lib/ai/image/types";
import type { CompositedImageResult } from "@/lib/ai/render/types";

// ─── Brand + Event context ───────────────────────────────────────────────────

export interface BrandContext {
  id: string;
  name: string;
  domain: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  voice: VoiceSettings;
  design: DesignSettings | Record<string, unknown>;
  sample_captions: SampleCaption[];
  /**
   * Brand-level structured visual defaults (Phase 4). Always present —
   * the loader fills missing blocks with `DEFAULT_BRAND_VISUAL_DEFAULTS`
   * so the visual compiler always has a valid base layer.
   */
  visual_defaults: BrandVisualDefaultsInput;
}

/**
 * Shape of the Event fields that override Brand rules on event-derived
 * generation. Every field is optional — if missing, the Brand base wins.
 */
export interface EventOverride {
  id: string;
  title: string;
  theme: string | null;
  objective: string | null;
  rules: string | null;
  reward: string | null;
  target_audience: string | null;
  cta: string | null;
  tone: string | null;
  platform_scope: string[] | null;
  notes_for_ai: string | null;
  posting_instance_summary: string | null;
  occurrence_iso: string | null; // the specific occurrence datetime for this generation
  start_at: string | null;
  end_at: string | null;
  /**
   * Event-level structured visual override (Phase 4). Null when the
   * event has no override block — the visual compiler falls through to
   * the brand's `visual_defaults` field-by-field.
   */
  visual_settings: EventVisualOverrideInput | null;
}

/**
 * Merged, source-agnostic voice context the prompt builder actually reads.
 * `resolve-context.ts#resolveEffectiveContext()` produces this.
 */
export interface EffectiveContext {
  positioning: string;
  tone: string;
  cta_style: string;
  emoji_level: string;
  language_style: string;
  language_style_sample: string;
  audience_persona: string;
  notes_for_ai: string;
  banned_phrases: string[];
  banned_topics: string[];
  default_hashtags: string[];

  /** Track which fields were overridden by the event so the prompt can
   *  surface the override reasoning in its structured section. */
  overridden_by_event: string[];
}

// ─── Per-source facts (discriminated union) ──────────────────────────────────

export interface BigWinFacts {
  kind: "big_win";
  /** Already masked per brand rules (see docs/07-ai-boundaries.md). */
  display_username: string;
  win_amount: number;
  currency: string;
  game_name: string;
  game_vendor: string | null;
  win_multiplier: number | null;
  occurred_at: string; // ISO
  source_row_key: string; // for dedupe
}

export interface PromoFacts {
  kind: "promo";
  promo_id: string;
  promo_title: string;
  mechanics: string;
  reward: string;
  period_start: string | null; // ISO
  period_end: string | null;   // ISO
  min_deposit: number | null;
  terms_summary: string | null;
}

export interface HotGamesFacts {
  kind: "hot_games";
  scan_timestamp: string; // ISO
  source_window_minutes: number;
  ranked_games: Array<{
    rank: number;
    game_name: string;
    vendor: string | null;
    rtp: number | null;
    time_slot_iso: string;
  }>;
  time_slot_summary: string; // e.g. "6pm–11pm tonight"
}

export interface EventFacts {
  kind: "event";
  title: string;
  objective: string | null;
  rules: string | null;
  reward: string | null;
  theme: string | null;
  target_audience: string | null;
  occurrence_iso: string | null;
}

export interface EducationalFacts {
  kind: "educational";
  topic: string;
  angle: string;
  key_point: string;
  cta_goal: string;
}

export type SourceFacts =
  | BigWinFacts
  | PromoFacts
  | HotGamesFacts
  | EventFacts
  | EducationalFacts;

// ─── Templates & Assets (supporting reference layer) ─────────────────────────
//
// Loaded by src/lib/ai/load-templates.ts and attached to
// NormalizedGenerationInput.templates by the orchestrator. Presented to
// the model as OPTIONAL reference patterns — never overrides Brand,
// Source Facts, or Event Brief. See docs/07-ai-boundaries.md.

/**
 * Text-style library entry (Copy Templates / CTA Snippets / Banner
 * Patterns / Prompt Templates).
 */
export interface TemplateRef {
  id: string;
  name: string;
  content: string;
  notes?: string;
  /** true when brand_id is null (admin-seeded global). */
  is_global: boolean;
}

/**
 * Reference asset (distinct from Brand Management's benchmark_assets,
 * which are base brand identity guidance rather than reusable library
 * material).
 */
export interface ReferenceAssetRef {
  id: string;
  name: string;
  url: string;
  asset_type: AssetType;
  notes?: string;
  is_global: boolean;
}

/**
 * Per-run retrieved library. Each bucket capped per
 * `TemplateCaps` in load-templates.ts.
 */
export interface BrandTemplates {
  copy: TemplateRef[];
  cta: TemplateRef[];
  banner: TemplateRef[];
  prompt: TemplateRef[];
  asset: ReferenceAssetRef[];
}

// ─── Normalized generator input ──────────────────────────────────────────────

/**
 * Source-agnostic input that feeds the prompt builder + orchestrator.
 * All source adapters MUST produce this shape.
 */
export interface NormalizedGenerationInput {
  /** Discriminator mirrored on source_facts.kind, kept at the top level
   *  so non-TS code (logs, audit) doesn't need to peek inside the union. */
  source_type: "big_win" | "promo" | "hot_games" | "event" | "educational";

  /** Stable correlation for the source row / event / scan / promo. */
  source_id: string;
  /** Optional per-occurrence key (events use the occurrence ISO). */
  source_instance_key: string | null;

  /** Brand + optional event context, pre-merged into `effective`. */
  brand: BrandContext;
  event: EventOverride | null;
  effective: EffectiveContext;

  /** Source-specific facts (discriminated union). */
  source_facts: SourceFacts;

  /** Post metadata — which post_type + platform this run should produce. */
  post_type: PostType;
  platform: Platform;

  /** How many sibling samples to generate in one call.
   *  Defaults per source: big_win=3, promo=3, hot_games=2, event=1,
   *  educational=2. */
  sample_count: number;

  /** Shared across sibling samples in this run. Assigned by the
   *  orchestrator; the inserter writes it into each draft's
   *  generation_context_json. */
  sample_group_id: string;

  /**
   * Optional reference library pulled from Templates & Assets. Attached
   * by the orchestrator (`runGeneration`) via `load-templates.ts`
   * before the prompt builder runs. Normalizers don't populate this —
   * they stay source-focused. Empty buckets are valid; generation
   * proceeds normally.
   */
  templates?: BrandTemplates;

  /**
   * Compiled visual prompt + layout/safe-zone config (Phase 4). Filled
   * by the orchestrator via `compileVisualPrompt()` after templates
   * load and before `buildPrompt()` runs. The prompt builder reads it
   * to surface a Visual Direction section so the AI's narrative
   * `image_prompt` aligns with the structured visual cues. The queue
   * inserter persists it under `generation_context_json.visual_compiled`
   * for the future image-rendering provider + overlay renderer.
   * Optional so off-pipeline call sites (tests, fixtures invoked
   * directly) keep typechecking.
   */
  visual?: CompiledVisualPrompt;

  /**
   * Per-sample background-image generation results (Phase 4 image
   * provider boundary, 2026-04-27; per-sample restructure 2026-04-29).
   * One result PER SAMPLE — `image_results[i]` corresponds to
   * `samples[i]`. Each sample's Claude-generated `image_prompt`
   * narrative drives its own Gemini call so the 3 siblings produce
   * 3 different image concepts. Failure is isolated per slot: a
   * BackgroundImageResult with `status: "error"` lands in the slot
   * where the call failed; other slots continue.
   * Optional so off-pipeline call sites keep typechecking.
   */
  image_results?: BackgroundImageResult[];

  /**
   * Per-sample composited image results (Phase 4 overlay renderer,
   * 2026-04-27; per-sample restructure 2026-04-29). One result PER
   * SAMPLE — `composited_images[i]` corresponds to `samples[i]`. Each
   * sample composites its OWN Gemini background + its OWN banner_text
   * via the deterministic overlay renderer. The artifact lives at
   * the GCS https URL (post-upload) or as a `data:` URI fallback.
   * Optional so off-pipeline call sites keep typechecking.
   */
  composited_images?: CompositedImageResult[];
}

// ─── AI output shape ─────────────────────────────────────────────────────────

/**
 * What a single AI call returns for one sample. The prompt builder asks
 * the model to emit this JSON; the parser in `client.ts` validates and
 * coerces it.
 */
export interface GeneratedSample {
  headline: string;
  caption: string;
  cta: string;
  banner_text: string | null;
  image_prompt: string;
}

export interface GenerationRunResult {
  samples: GeneratedSample[];
  /** Metadata the queue inserter writes into generation_context_json of
   *  every inserted draft. */
  meta: {
    source_type: NormalizedGenerationInput["source_type"];
    source_id: string;
    source_instance_key: string | null;
    sample_group_id: string;
    sample_total: number;
    prompt_version: string;
    ai_provider: string;   // "stub" for dry-run; "anthropic"/"openai" later
    ai_dry_run: boolean;
    generated_at: string;  // ISO
  };
}
