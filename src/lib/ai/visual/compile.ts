// Hidden prompt compiler — turns structured Brand + Event + source
// inputs into the actual AI image prompt + layout/safe-zone spec for
// the overlay renderer.
//
// Operators never author this prompt. They pick from structured
// controls (style, emphasis, subject, layout, format, negatives); this
// module composes the full text under the hood.
//
// Product rules encoded in the output (see docs/07-ai-boundaries.md):
//   - AI generates backgrounds / art only. Never typography.
//   - The app renders final text + logos via overlay.
//   - Safe zones for text overlay are explicitly described in the
//     positive prompt (so the AI leaves them quiet) AND mirrored in
//     the output's `safe_zone_config` (so the renderer knows where
//     to composite text).
//
// This module is pure. No I/O, no Prisma, no environment reads.

import type { Platform } from "@/generated/prisma/enums";
import type { SourceFacts } from "@/lib/ai/types";
import { resolveLayout } from "./layouts";
import type {
  BrandVisualDefaults,
  CompiledVisualPrompt,
  EventVisualOverride,
  LayoutFamily,
  MainSubjectType,
  PlatformFormat,
  VisualEmphasis,
  VisualStyle,
} from "./types";

export interface CompileInputs {
  brand: BrandVisualDefaults;
  /** null / undefined when the post is not event-derived. */
  event?: EventVisualOverride | null;
  /** Target platform — used to resolve a default format if neither brand
   *  nor event specify one. */
  platform: Platform;
  /** Optional source facts — informs subject derivation (e.g. Big Wins
   *  → "winner celebrating near casino slot reels"). */
  source_facts?: SourceFacts | null;
}

/**
 * Platform → default PlatformFormat when Brand + Event both leave it
 * unset. Conservative: square everywhere except where the platform has
 * a well-known vertical orientation.
 */
const PLATFORM_DEFAULT_FORMAT: Record<Platform, PlatformFormat> = {
  facebook: "square",
  instagram: "square",
  twitter: "landscape",
  tiktok: "portrait",
  telegram: "square",
};

/**
 * Hardcoded baseline negatives — apply to every compiled prompt.
 * This is what enforces "AI never draws text". Brand + Event
 * negatives are appended to this list.
 */
const BASELINE_NEGATIVES = [
  "text in image",
  "words",
  "letters",
  "typography",
  "numbers",
  "captions",
  "watermarks",
  "brand names drawn in image",
  "logos drawn in pixels",
  "subtitles",
  "signage",
  "UI elements",
  "menus",
  "buttons",
];

/**
 * Style → descriptor phrase injected at the top of the prompt.
 */
const STYLE_DESCRIPTOR: Record<VisualStyle, string> = {
  photographic: "photographic, realistic camera, natural lighting",
  illustrated: "2D flat illustration, clean vector-like shapes",
  "3d": "3D-rendered, cinematic studio lighting, realistic materials",
  vector: "clean vector art, flat shapes, bold colors",
  cinematic: "cinematic composition, dramatic lighting, shallow depth of field",
  minimalist: "minimalist composition, high negative space, restrained palette",
};

/**
 * Emphasis → primary focal instruction.
 */
const EMPHASIS_INSTRUCTION: Record<VisualEmphasis, string> = {
  "reward-forward":
    "the reward is the visual hero — hero-framed, well-lit, unmistakable",
  "winner-forward":
    "a person celebrating a win — authentic joy, genuine reaction, hero-framed",
  "game-forward":
    "the game artwork / symbols are the visual hero, dynamically composed",
  "brand-forward":
    "the brand identity dominates — bold brand colors, confident composition",
  "lifestyle":
    "an aspirational lifestyle moment — people enjoying the brand context",
};

/**
 * Main subject → generic fallback description when source facts don't
 * suggest a stronger concrete subject.
 */
const SUBJECT_FALLBACK: Record<MainSubjectType, string> = {
  human: "a person, natural expression, medium shot",
  object: "a single hero object, well-defined silhouette",
  "game-element": "slot-reel symbols, playing cards, or casino chips as artwork",
  symbol: "a bold abstract symbol — crown, star, spark, or burst",
  abstract: "abstract geometric shapes, gradient forms",
};

// ─── Public entry point ─────────────────────────────────────────────────────

export function compileVisualPrompt(inputs: CompileInputs): CompiledVisualPrompt {
  // 1. Resolve effective inputs (Brand → Event override)
  const {
    effective,
    overridden,
  } = resolveEffective(inputs.brand, inputs.event);

  // 2. Resolve platform format.
  //    Precedence (highest → lowest):
  //      a. Event override — operator was explicit for this specific event
  //      b. Platform-appropriate default — the platform itself dictates
  //         (e.g. TikTok → portrait, Twitter → landscape). This wins over
  //         Brand's generic default because picking a platform implies
  //         picking its natural orientation.
  //      c. Brand default — lowest-priority fallback. Only matters when
  //         the platform map doesn't cover the target (should never
  //         happen in MVP — every Platform has a map entry).
  const platform_format: PlatformFormat =
    inputs.event?.platform_format ??
    PLATFORM_DEFAULT_FORMAT[inputs.platform] ??
    inputs.brand.platform_format_default;

  // 3. Pick the concrete layout template.
  const layout = resolveLayout(effective.layout_family, platform_format);

  // 4. Derive subject focus — source facts take priority over the
  //    generic main_subject_type fallback because they carry concrete,
  //    prompt-useful info (game name, reward amount, etc.).
  const subject_focus = deriveSubjectFocus(
    inputs.source_facts ?? null,
    effective.main_subject_type,
    effective.visual_emphasis,
  );

  // 5. Compose the background image prompt. The composition order
  //    matters: style → emphasis → subject → scene guidance → safe-
  //    zone guidance. Image models tend to weight earlier tokens
  //    more heavily.
  const background_image_prompt = composeBackgroundPrompt({
    visual_style: effective.visual_style,
    visual_emphasis: effective.visual_emphasis,
    subject_focus,
    layout_emphasis_area: layout.emphasis_area,
    safe_zone_instruction: composeSafeZoneInstruction(layout),
    platform_format,
    brand_visual_notes: inputs.brand.visual_notes,
    event_visual_notes: inputs.event?.visual_notes,
  });

  // 6. Compose the negative prompt.
  const negative_prompt = composeNegativePrompt(
    inputs.brand.negative_visual_elements ?? [],
    inputs.event?.negative_visual_elements ?? [],
  );

  return {
    background_image_prompt,
    negative_prompt,
    layout_key: layout.key,
    safe_zone_config: {
      zones: layout.safe_zones,
      gradient_overlay: layout.gradient_overlay,
    },
    render_intent: "ai_background_then_overlay",
    platform_format,
    visual_emphasis: effective.visual_emphasis,
    subject_focus,
    effective_inputs: {
      visual_style: effective.visual_style,
      visual_emphasis: effective.visual_emphasis,
      main_subject_type: effective.main_subject_type,
      layout_family: effective.layout_family,
      overridden_by_event: overridden,
    },
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface ResolvedEffective {
  visual_style: VisualStyle;
  visual_emphasis: VisualEmphasis;
  main_subject_type: MainSubjectType;
  layout_family: LayoutFamily;
}

function resolveEffective(
  brand: BrandVisualDefaults,
  event: EventVisualOverride | null | undefined,
): { effective: ResolvedEffective; overridden: Array<keyof EventVisualOverride> } {
  const overridden: Array<keyof EventVisualOverride> = [];
  const pick = <K extends keyof ResolvedEffective>(
    key: K,
    eventKey: keyof EventVisualOverride,
    brandValue: ResolvedEffective[K],
  ): ResolvedEffective[K] => {
    const ev = event?.[eventKey as keyof EventVisualOverride];
    if (ev !== undefined && ev !== null) {
      overridden.push(eventKey);
      return ev as ResolvedEffective[K];
    }
    return brandValue;
  };

  return {
    effective: {
      // visual_style has no Event override — stays brand-level.
      visual_style: brand.visual_style,
      visual_emphasis: pick("visual_emphasis", "visual_emphasis", brand.visual_emphasis),
      main_subject_type: pick("main_subject_type", "main_subject_type", brand.main_subject_type),
      layout_family: pick("layout_family", "layout_family", brand.layout_family),
    },
    overridden,
  };
}

/**
 * Source-aware subject phrase. When source facts are present we lean
 * on them for concreteness (game name, reward descriptor); falls back
 * to the generic `main_subject_type` descriptor otherwise.
 */
function deriveSubjectFocus(
  facts: SourceFacts | null,
  fallbackSubject: MainSubjectType,
  emphasis: VisualEmphasis,
): string {
  if (!facts) return SUBJECT_FALLBACK[fallbackSubject];

  switch (facts.kind) {
    case "big_win": {
      const gameLabel = facts.game_name ?? "a casino game";
      if (emphasis === "winner-forward") {
        return `a player celebrating an exceptional win, ${gameLabel} visible in the background`;
      }
      return `a hero-framed composition around ${gameLabel}, gold accents, sense of a big win moment`;
    }
    case "promo": {
      const reward = facts.reward || "a rewarding bonus";
      return `a hero visualization of ${reward}, clean product-shot framing`;
    }
    case "hot_games": {
      const top = facts.ranked_games[0]?.game_name;
      return top
        ? `an energetic collage featuring ${top} and other top casino games, stylized`
        : `an energetic collage of top casino-game artwork, stylized`;
    }
    case "event": {
      if (facts.theme) return `a themed scene — ${facts.theme}, editorial composition`;
      return `a themed event scene, editorial composition`;
    }
    case "educational":
      return `a clean explanatory visual around ${facts.topic}, accessible and uncluttered`;
    default: {
      // Exhaustiveness check
      const _never: never = facts;
      void _never;
      return SUBJECT_FALLBACK[fallbackSubject];
    }
  }
}

function composeSafeZoneInstruction(layout: {
  safe_zones: Array<{ description: string; expectation: string }>;
}): string {
  if (layout.safe_zones.length === 0) return "";
  const phrases = layout.safe_zones.map((z) => `(${z.description} — ${z.expectation})`);
  return `Composition must leave these zones visually quiet so text can be overlaid later: ${phrases.join("; ")}.`;
}

/**
 * Per-sample structural appendix (added 2026-04-29).
 *
 * Glued onto each sample's Claude-generated `image_prompt` narrative
 * before sending to Gemini. Carries:
 *   - aspect ratio hint (drives composition for the format)
 *   - safe-zone instruction (where to leave quiet space for text overlay)
 *   - brand palette hint (subtle color guidance — not a hard rule)
 *   - the absolute anti-text rule (also enforced by the negative prompt)
 *
 * Style / emphasis / subject / brand notes are NOT added here — the
 * sample's own image_prompt already encodes those because Claude saw
 * the visual_compiled context when writing it.
 */
export function composeImagePromptStructuralAppendix(args: {
  visual: CompiledVisualPrompt;
  brand_palette?: { primary: string | null; secondary: string | null; accent: string | null };
}): string {
  const parts: string[] = [];

  parts.push(`Target aspect ratio: ${formatAspectHint(args.visual.platform_format)}.`);

  const safeZone = composeSafeZoneInstruction({ safe_zones: args.visual.safe_zone_config.zones });
  if (safeZone) parts.push(safeZone);

  if (args.brand_palette) {
    const colors = [args.brand_palette.primary, args.brand_palette.secondary, args.brand_palette.accent]
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0);
    if (colors.length > 0) {
      parts.push(`Favor a palette aligned with brand colors: ${colors.join(", ")}.`);
    }
  }

  parts.push(
    "Absolutely no text, letters, numbers, typography, brand names, logos, watermarks, UI elements, or signage anywhere in the image.",
  );

  return parts.join(" ");
}

function composeBackgroundPrompt(args: {
  visual_style: VisualStyle;
  visual_emphasis: VisualEmphasis;
  subject_focus: string;
  layout_emphasis_area: string;
  safe_zone_instruction: string;
  platform_format: PlatformFormat;
  brand_visual_notes?: string;
  event_visual_notes?: string;
}): string {
  const parts: string[] = [];

  parts.push(`Style: ${STYLE_DESCRIPTOR[args.visual_style]}.`);
  parts.push(`Primary focus: ${EMPHASIS_INSTRUCTION[args.visual_emphasis]}.`);
  parts.push(`Subject: ${args.subject_focus}.`);
  parts.push(`Place the focal subject in the ${args.layout_emphasis_area} area of the composition.`);
  parts.push(`Target aspect ratio: ${formatAspectHint(args.platform_format)}.`);

  if (args.safe_zone_instruction) {
    parts.push(args.safe_zone_instruction);
  }

  if (args.brand_visual_notes) {
    parts.push(`Brand note: ${args.brand_visual_notes}.`);
  }
  if (args.event_visual_notes) {
    parts.push(`Event note: ${args.event_visual_notes}.`);
  }

  // The absolute hardest rule goes last (and is also enforced in the
  // negative prompt). Placement at the end keeps the composition
  // instructions cleanly separated from the anti-text rule.
  parts.push(
    "Absolutely no text, letters, numbers, typography, brand names, logos, watermarks, UI elements, or signage anywhere in the image.",
  );

  return parts.join(" ");
}

function composeNegativePrompt(brandNegatives: string[], eventNegatives: string[]): string {
  const combined = [...BASELINE_NEGATIVES, ...brandNegatives, ...eventNegatives];
  const deduped = Array.from(new Set(combined.map((s) => s.trim()).filter(Boolean)));
  return deduped.join(", ");
}

function formatAspectHint(format: PlatformFormat): string {
  switch (format) {
    case "square":
      return "1:1 square";
    case "portrait":
      return "4:5 portrait";
    case "landscape":
      return "16:9 landscape";
    case "story":
      return "9:16 vertical story";
  }
}
