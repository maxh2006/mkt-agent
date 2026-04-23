// Visual input architecture — typed shapes for the simplified
// structured-input + hidden-prompt-compiler pipeline.
//
// Product architecture rule (locked — see docs/07-ai-boundaries.md):
//   - AI image model generates BACKGROUNDS / ART ONLY.
//   - The app renders FINAL TEXT + LOGOS programmatically via
//     deterministic layout templates + safe-zone rules.
//   - Operators do NOT author detailed visual prompts. They pick from
//     structured controls; the hidden compiler builds the prompt.
//
// Precedence (unchanged from text pipeline):
//   Brand Management (base) → Source facts (context) → Event brief (override) → Templates (supporting library)
//
// Scope of this module: TYPE definitions for inputs + outputs of the
// compiler + layout spec. No UI, no persistence, no image model, no
// overlay renderer. All of those slot in later against these types.

import type { Platform } from "@/generated/prisma/enums";

// ─── Structured operator inputs (enums) ─────────────────────────────────────
//
// The core user-facing simplification: what used to be freeform prose
// ("preferred_visual_style", "design_theme_notes") becomes a small set
// of pickable values. Adding new values in this file is the only place
// the rest of the pipeline needs to learn about a new option.

export const VISUAL_STYLES = [
  "photographic",   // realistic camera-feel
  "illustrated",    // 2D flat illustration
  "3d",             // 3D-rendered
  "vector",         // clean vector art
  "cinematic",      // dramatic lighting, cinematic composition
  "minimalist",     // sparse, high-negative-space
] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

export const VISUAL_EMPHASES = [
  "reward-forward",   // the prize/reward is the visual hero
  "winner-forward",   // a person/winner celebrating
  "game-forward",     // the game artwork is the hero
  "brand-forward",    // brand identity / logo prominence
  "lifestyle",        // aspirational lifestyle context
] as const;
export type VisualEmphasis = (typeof VISUAL_EMPHASES)[number];

export const MAIN_SUBJECT_TYPES = [
  "human",           // person, face, hands
  "object",          // coin, trophy, bonus item
  "game-element",    // reel, card, chip, specific game artwork
  "symbol",          // abstract symbol (crown, star, spark)
  "abstract",        // no literal subject, pattern/gradient
] as const;
export type MainSubjectType = (typeof MAIN_SUBJECT_TYPES)[number];

export const LAYOUT_FAMILIES = [
  "center_focus",
  "left_split",
  "right_split",
  "bottom_heavy",
] as const;
export type LayoutFamily = (typeof LAYOUT_FAMILIES)[number];

export const PLATFORM_FORMATS = [
  "square",     // 1:1 — IG feed, FB feed
  "portrait",   // 4:5 — IG feed alt, TikTok, Reels
  "landscape",  // 16:9 — FB / Twitter
  "story",      // 9:16 — IG/FB stories
] as const;
export type PlatformFormat = (typeof PLATFORM_FORMATS)[number];

// ─── Brand-level visual defaults ────────────────────────────────────────────

export interface BrandVisualDefaults {
  /** Primary style family. Required — drives style language in prompt. */
  visual_style: VisualStyle;
  /** What the visual should emphasize by default across this brand. */
  visual_emphasis: VisualEmphasis;
  /** Preferred subject family. Compiler overrides when source_facts imply a stronger subject. */
  main_subject_type: MainSubjectType;
  /** Preferred layout family. Compiler falls back to platform-default when missing. */
  layout_family: LayoutFamily;
  /** Default platform format when the post doesn't dictate one. */
  platform_format_default: PlatformFormat;
  /** Things to NEVER appear in this brand's imagery. Enforced via negative_prompt. */
  negative_visual_elements: string[];
  /** Optional short note — max 200 chars, NOT a prompt. Stylistic nudge only. */
  visual_notes?: string;
}

// ─── Event-level visual override (all optional) ─────────────────────────────
//
// Operators only fill fields that are SPECIAL for this event. Everything
// else falls through to Brand defaults via the compiler.

export interface EventVisualOverride {
  visual_emphasis?: VisualEmphasis;
  main_subject_type?: MainSubjectType;
  layout_family?: LayoutFamily;
  platform_format?: PlatformFormat;
  negative_visual_elements?: string[];
  /** Optional short nudge specific to this event — max 200 chars. */
  visual_notes?: string;
}

// ─── Layout template spec ───────────────────────────────────────────────────
//
// Each layout is a deterministic description of where text, logos, and
// quiet visual areas go on a canvas. Coordinates are percentages of the
// canvas (0–100), so templates are resolution-independent.

export type TextSlot = "headline" | "caption" | "cta" | "banner" | "brand_logo";
export type Align = "left" | "center" | "right";

export interface Rect {
  /** 0–100 percent of canvas width. */
  x: number;
  /** 0–100 percent of canvas height. */
  y: number;
  /** 0–100 percent of canvas width. */
  width: number;
  /** 0–100 percent of canvas height. */
  height: number;
}

export interface TextZone {
  slot: TextSlot;
  rect: Rect;
  align: Align;
  /** Hint for overlay renderer — "prominent" ≈ 2x weight of "supporting". */
  emphasis: "prominent" | "supporting" | "subtle";
}

export type SafeZoneExpectation =
  | "quiet"              // low visual complexity, no busy detail
  | "solid_background"   // uniform tone (single color, flat)
  | "gradient_darkened"  // darkened gradient overlay will be applied by renderer
  | "empty";             // no subject at all, negative space

export interface SafeZone {
  /** Human-readable reason for this zone — baked into the prompt instruction. */
  description: string;
  rect: Rect;
  expectation: SafeZoneExpectation;
}

export interface LogoSlot {
  rect: Rect;
  /** Which brand logo variant to render here. */
  variant: "main" | "square" | "horizontal" | "vertical";
}

export interface GradientOverlay {
  /** Which edge the gradient darkens toward. */
  direction: "top" | "bottom" | "left" | "right";
  /** 0–100 percent of the canvas the gradient covers. */
  extent: number;
  /** 0–1 opacity at the darkened edge. */
  intensity: number;
}

export interface LayoutTemplate {
  key: LayoutFamily;
  label: string;
  description: string;
  /** Platform formats this layout supports well. Compiler picks an alternative when mismatched. */
  supported_formats: PlatformFormat[];
  text_zones: TextZone[];
  safe_zones: SafeZone[];
  logo_slot?: LogoSlot;
  gradient_overlay?: GradientOverlay;
  cta_alignment: Align;
  /** Which area the AI should place its focal subject in. */
  emphasis_area: "center" | "top" | "bottom" | "left" | "right";
}

// ─── Compiler output ────────────────────────────────────────────────────────
//
// What `compileVisualPrompt()` produces. The AI image provider consumes
// `background_image_prompt` + `negative_prompt`; the overlay renderer
// consumes `layout_key` + `safe_zone_config` + the original text fields.

export type RenderIntent = "ai_background_then_overlay";

export interface SafeZoneConfig {
  /** Echo of the layout's safe zones for the renderer. */
  zones: SafeZone[];
  /** Gradient overlay the renderer will apply after the AI background is generated. */
  gradient_overlay?: GradientOverlay;
}

export interface CompiledVisualPrompt {
  /** Full positive prompt for the image model. AI generates background art
   *  per this prompt — NEVER text, words, or typography. */
  background_image_prompt: string;
  /** Negative prompt — forbidden content. Always contains the hardcoded
   *  "no text in image" baseline; brand + event negatives are appended. */
  negative_prompt: string;
  /** Which canonical layout the overlay renderer will use. */
  layout_key: LayoutFamily;
  /** Safe-zone + gradient config the renderer reads to avoid clobbering
   *  AI-generated subject with text overlays. */
  safe_zone_config: SafeZoneConfig;
  /** Locked to "ai_background_then_overlay" in MVP — the split rendering
   *  product rule. Future render intents can be added without breaking
   *  the compiler contract. */
  render_intent: RenderIntent;
  /** Echoed from resolved inputs for downstream observability. */
  platform_format: PlatformFormat;
  visual_emphasis: VisualEmphasis;
  /** The concrete subject the compiler chose — derived from source facts
   *  when possible, otherwise from `main_subject_type`. Not a UI field. */
  subject_focus: string;
  /** Echo of the resolved Brand + Event inputs (post-precedence) — for
   *  debugging + audit. Never sent to the image model. */
  effective_inputs: {
    visual_style: VisualStyle;
    visual_emphasis: VisualEmphasis;
    main_subject_type: MainSubjectType;
    layout_family: LayoutFamily;
    overridden_by_event: Array<keyof EventVisualOverride>;
  };
}
