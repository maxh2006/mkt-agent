// Canonical layout templates — deterministic descriptions of where text,
// logos, and safe zones go on a canvas. Resolution-independent (all
// coordinates are 0–100 percent of canvas). Each template represents a
// ready-to-render spec the future overlay renderer consumes.
//
// This file is intentionally NOT the renderer. It is the SPEC the
// renderer will honor. See docs/00-architecture.md → "Visual pipeline".
//
// To add a new layout:
//   1. Add its key to `LAYOUT_FAMILIES` in types.ts
//   2. Add its template definition below
//   3. Make sure `LAYOUT_TEMPLATES` maps every `LayoutFamily` value
//      (TypeScript's `Record<LayoutFamily, LayoutTemplate>` enforces this)

import type {
  LayoutFamily,
  LayoutTemplate,
  PlatformFormat,
} from "./types";

/**
 * center_focus — the hero subject sits centered on the canvas.
 * Text + logo sit over the bottom third via a darkened gradient.
 * Best for: big-win moments, reward showcases, clean product shots.
 */
const CENTER_FOCUS: LayoutTemplate = {
  key: "center_focus",
  label: "Center Focus",
  description:
    "Hero subject in the upper 65% of the canvas. Text + logo flow over a darkened gradient across the bottom 35%.",
  supported_formats: ["square", "portrait", "story"],
  emphasis_area: "center",
  cta_alignment: "center",
  text_zones: [
    {
      slot: "headline",
      rect: { x: 8, y: 65, width: 84, height: 10 },
      align: "center",
      emphasis: "prominent",
    },
    {
      slot: "caption",
      rect: { x: 10, y: 76, width: 80, height: 12 },
      align: "center",
      emphasis: "supporting",
    },
    {
      slot: "cta",
      rect: { x: 30, y: 90, width: 40, height: 7 },
      align: "center",
      emphasis: "prominent",
    },
    {
      slot: "brand_logo",
      rect: { x: 4, y: 4, width: 18, height: 8 },
      align: "left",
      emphasis: "subtle",
    },
    {
      slot: "banner",
      rect: { x: 30, y: 55, width: 40, height: 7 },
      align: "center",
      emphasis: "prominent",
    },
  ],
  safe_zones: [
    {
      description: "Bottom 35% reserved for headline + caption + CTA overlay",
      rect: { x: 0, y: 65, width: 100, height: 35 },
      expectation: "gradient_darkened",
    },
    {
      description: "Top-left corner reserved for brand logo",
      rect: { x: 0, y: 0, width: 24, height: 14 },
      expectation: "quiet",
    },
  ],
  logo_slot: {
    rect: { x: 4, y: 4, width: 18, height: 8 },
    variant: "horizontal",
  },
  gradient_overlay: {
    direction: "bottom",
    extent: 40,
    intensity: 0.75,
  },
};

/**
 * left_split — subject on the left, text stack on the right.
 * Best for landscape formats (16:9) where horizontal rhythm reads well.
 */
const LEFT_SPLIT: LayoutTemplate = {
  key: "left_split",
  label: "Left Split",
  description:
    "Subject occupies the left ~55% of the canvas; text stack fills the right ~45%.",
  supported_formats: ["landscape", "square"],
  emphasis_area: "left",
  cta_alignment: "left",
  text_zones: [
    {
      slot: "headline",
      rect: { x: 58, y: 18, width: 38, height: 18 },
      align: "left",
      emphasis: "prominent",
    },
    {
      slot: "caption",
      rect: { x: 58, y: 38, width: 38, height: 30 },
      align: "left",
      emphasis: "supporting",
    },
    {
      slot: "cta",
      rect: { x: 58, y: 72, width: 28, height: 8 },
      align: "left",
      emphasis: "prominent",
    },
    {
      slot: "brand_logo",
      rect: { x: 58, y: 84, width: 20, height: 10 },
      align: "left",
      emphasis: "subtle",
    },
    {
      slot: "banner",
      rect: { x: 4, y: 4, width: 50, height: 10 },
      align: "left",
      emphasis: "prominent",
    },
  ],
  safe_zones: [
    {
      description: "Right 45% reserved for text stack",
      rect: { x: 55, y: 0, width: 45, height: 100 },
      expectation: "quiet",
    },
  ],
  logo_slot: {
    rect: { x: 58, y: 84, width: 20, height: 10 },
    variant: "horizontal",
  },
};

/**
 * right_split — mirror of left_split. Subject on right, text on left.
 */
const RIGHT_SPLIT: LayoutTemplate = {
  key: "right_split",
  label: "Right Split",
  description:
    "Subject occupies the right ~55% of the canvas; text stack fills the left ~45%.",
  supported_formats: ["landscape", "square"],
  emphasis_area: "right",
  cta_alignment: "left",
  text_zones: [
    {
      slot: "headline",
      rect: { x: 4, y: 18, width: 38, height: 18 },
      align: "left",
      emphasis: "prominent",
    },
    {
      slot: "caption",
      rect: { x: 4, y: 38, width: 38, height: 30 },
      align: "left",
      emphasis: "supporting",
    },
    {
      slot: "cta",
      rect: { x: 4, y: 72, width: 28, height: 8 },
      align: "left",
      emphasis: "prominent",
    },
    {
      slot: "brand_logo",
      rect: { x: 4, y: 84, width: 20, height: 10 },
      align: "left",
      emphasis: "subtle",
    },
    {
      slot: "banner",
      rect: { x: 50, y: 4, width: 46, height: 10 },
      align: "right",
      emphasis: "prominent",
    },
  ],
  safe_zones: [
    {
      description: "Left 45% reserved for text stack",
      rect: { x: 0, y: 0, width: 45, height: 100 },
      expectation: "quiet",
    },
  ],
  logo_slot: {
    rect: { x: 4, y: 84, width: 20, height: 10 },
    variant: "horizontal",
  },
};

/**
 * bottom_heavy — text-dominant layout. Subject occupies the top ~45%,
 * text block consumes the lower half. Good for campaigns where the
 * *message* matters more than the subject (educational posts, T&C-
 * heavy promos). Gradient darkens the bottom half.
 */
const BOTTOM_HEAVY: LayoutTemplate = {
  key: "bottom_heavy",
  label: "Bottom Heavy",
  description:
    "Subject occupies the upper ~45%; headline + caption + CTA dominate the lower ~55%.",
  supported_formats: ["square", "portrait", "story"],
  emphasis_area: "top",
  cta_alignment: "center",
  text_zones: [
    {
      slot: "headline",
      rect: { x: 8, y: 50, width: 84, height: 12 },
      align: "center",
      emphasis: "prominent",
    },
    {
      slot: "caption",
      rect: { x: 10, y: 63, width: 80, height: 22 },
      align: "center",
      emphasis: "supporting",
    },
    {
      slot: "cta",
      rect: { x: 30, y: 88, width: 40, height: 7 },
      align: "center",
      emphasis: "prominent",
    },
    {
      slot: "brand_logo",
      rect: { x: 4, y: 4, width: 18, height: 8 },
      align: "left",
      emphasis: "subtle",
    },
    {
      slot: "banner",
      rect: { x: 30, y: 42, width: 40, height: 6 },
      align: "center",
      emphasis: "prominent",
    },
  ],
  safe_zones: [
    {
      description:
        "Bottom 55% reserved for headline + caption + CTA — must be darkened/flat",
      rect: { x: 0, y: 50, width: 100, height: 50 },
      expectation: "gradient_darkened",
    },
  ],
  logo_slot: {
    rect: { x: 4, y: 4, width: 18, height: 8 },
    variant: "horizontal",
  },
  gradient_overlay: {
    direction: "bottom",
    extent: 55,
    intensity: 0.8,
  },
};

/** Canonical layouts keyed by `LayoutFamily`. Exhaustive by type. */
export const LAYOUT_TEMPLATES: Record<LayoutFamily, LayoutTemplate> = {
  center_focus: CENTER_FOCUS,
  left_split: LEFT_SPLIT,
  right_split: RIGHT_SPLIT,
  bottom_heavy: BOTTOM_HEAVY,
};

/**
 * Default platform-format → layout-family fallback. Used when a
 * layout family isn't specified (or isn't supported by the target
 * format).
 */
export const DEFAULT_LAYOUT_BY_FORMAT: Record<PlatformFormat, LayoutFamily> = {
  square: "center_focus",
  portrait: "bottom_heavy",
  story: "bottom_heavy",
  landscape: "left_split",
};

/**
 * Returns the layout template to use for a given preference + platform
 * format. Falls back to the format default when the preferred family
 * doesn't support the target format.
 */
export function resolveLayout(
  preferred: LayoutFamily,
  format: PlatformFormat,
): LayoutTemplate {
  const candidate = LAYOUT_TEMPLATES[preferred];
  if (candidate.supported_formats.includes(format)) return candidate;
  return LAYOUT_TEMPLATES[DEFAULT_LAYOUT_BY_FORMAT[format]];
}
