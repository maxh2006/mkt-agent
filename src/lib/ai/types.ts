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
