// Zod schemas + tolerant readers for the visual input shapes.
//
// Wiring status (as of 2026-04-27):
//   - Brand: `brandVisualDefaultsSchema` is wired into `designSettingsSchema`
//     in `src/lib/validations/brand.ts`. UI persists into
//     `Brand.design_settings_json.visual_defaults`.
//   - Event: `eventVisualOverrideSchema` is wired into `createEventSchema`
//     and `updateEventSchema` in `src/lib/validations/event.ts`. UI
//     persists into the new `Event.visual_settings_json` JSON column
//     (migration 20260427150000_event_visual_settings_json).

import { z } from "zod";
import {
  LAYOUT_FAMILIES,
  MAIN_SUBJECT_TYPES,
  PLATFORM_FORMATS,
  VISUAL_EMPHASES,
  VISUAL_STYLES,
} from "./types";

const negativeVisualElement = z.string().trim().min(1).max(120);

export const brandVisualDefaultsSchema = z.object({
  visual_style: z.enum(VISUAL_STYLES),
  visual_emphasis: z.enum(VISUAL_EMPHASES),
  main_subject_type: z.enum(MAIN_SUBJECT_TYPES),
  layout_family: z.enum(LAYOUT_FAMILIES),
  platform_format_default: z.enum(PLATFORM_FORMATS),
  negative_visual_elements: z.array(negativeVisualElement).max(20).default([]),
  visual_notes: z.string().trim().max(200).optional(),
});

export const eventVisualOverrideSchema = z.object({
  visual_emphasis: z.enum(VISUAL_EMPHASES).optional(),
  main_subject_type: z.enum(MAIN_SUBJECT_TYPES).optional(),
  layout_family: z.enum(LAYOUT_FAMILIES).optional(),
  platform_format: z.enum(PLATFORM_FORMATS).optional(),
  negative_visual_elements: z.array(negativeVisualElement).max(20).optional(),
  visual_notes: z.string().trim().max(200).optional(),
});

export type BrandVisualDefaultsInput = z.infer<typeof brandVisualDefaultsSchema>;
export type EventVisualOverrideInput = z.infer<typeof eventVisualOverrideSchema>;

/**
 * Sensible starting defaults — used by the Brand Management form when
 * a brand has no visual_defaults block yet. Purposely conservative /
 * wide; operators dial this in per brand.
 */
export const DEFAULT_BRAND_VISUAL_DEFAULTS: BrandVisualDefaultsInput = {
  visual_style: "photographic",
  visual_emphasis: "reward-forward",
  main_subject_type: "object",
  layout_family: "center_focus",
  platform_format_default: "square",
  negative_visual_elements: [],
};

/**
 * Tolerant reader for `Brand.design_settings_json.visual_defaults` raw
 * JSON. Used by the server-side `loadBrandContext()` to lift the saved
 * block into the AI generator's `BrandContext`. Returns a fully-formed
 * `BrandVisualDefaultsInput` — out-of-enum legacy values fall back per
 * field to `DEFAULT_BRAND_VISUAL_DEFAULTS`, missing blocks return the
 * defaults outright. Mirrors the inline `coerceVisualDefaults()` logic
 * in the brand-management page so behavior stays in sync.
 */
export function coerceBrandVisualDefaults(raw: unknown): BrandVisualDefaultsInput {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_BRAND_VISUAL_DEFAULTS };
  const r = raw as Record<string, unknown>;
  const inEnum = <T extends readonly string[]>(v: unknown, vals: T): v is T[number] =>
    typeof v === "string" && (vals as readonly string[]).includes(v);

  const negs = Array.isArray(r.negative_visual_elements)
    ? (r.negative_visual_elements as unknown[])
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim())
    : [];
  const notes = typeof r.visual_notes === "string" ? r.visual_notes.trim() : "";

  return {
    visual_style: inEnum(r.visual_style, VISUAL_STYLES)
      ? r.visual_style
      : DEFAULT_BRAND_VISUAL_DEFAULTS.visual_style,
    visual_emphasis: inEnum(r.visual_emphasis, VISUAL_EMPHASES)
      ? r.visual_emphasis
      : DEFAULT_BRAND_VISUAL_DEFAULTS.visual_emphasis,
    main_subject_type: inEnum(r.main_subject_type, MAIN_SUBJECT_TYPES)
      ? r.main_subject_type
      : DEFAULT_BRAND_VISUAL_DEFAULTS.main_subject_type,
    layout_family: inEnum(r.layout_family, LAYOUT_FAMILIES)
      ? r.layout_family
      : DEFAULT_BRAND_VISUAL_DEFAULTS.layout_family,
    platform_format_default: inEnum(r.platform_format_default, PLATFORM_FORMATS)
      ? r.platform_format_default
      : DEFAULT_BRAND_VISUAL_DEFAULTS.platform_format_default,
    negative_visual_elements: negs,
    ...(notes ? { visual_notes: notes } : {}),
  };
}

/**
 * Tolerant reader for `Event.visual_settings_json` raw JSON. Used by the
 * Event create / edit forms to seed local form state from the persisted
 * payload. Returns ONLY validated, present fields — out-of-enum values
 * are silently dropped (the operator can re-pick on the form), and an
 * empty / missing override block returns an empty object representing
 * "no override on any field". Empty `negative_visual_elements` arrays and
 * blank `visual_notes` strings are dropped so the resulting form state
 * matches the persistence convention exactly (round-tripping is clean).
 */
export function coerceEventVisualOverride(raw: unknown): EventVisualOverrideInput {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const inEnum = <T extends readonly string[]>(v: unknown, vals: T): v is T[number] =>
    typeof v === "string" && (vals as readonly string[]).includes(v);

  const out: EventVisualOverrideInput = {};
  if (inEnum(r.visual_emphasis, VISUAL_EMPHASES)) out.visual_emphasis = r.visual_emphasis;
  if (inEnum(r.main_subject_type, MAIN_SUBJECT_TYPES)) out.main_subject_type = r.main_subject_type;
  if (inEnum(r.layout_family, LAYOUT_FAMILIES)) out.layout_family = r.layout_family;
  if (inEnum(r.platform_format, PLATFORM_FORMATS)) out.platform_format = r.platform_format;

  if (Array.isArray(r.negative_visual_elements)) {
    const negs = (r.negative_visual_elements as unknown[])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim());
    if (negs.length > 0) out.negative_visual_elements = negs;
  }

  if (typeof r.visual_notes === "string" && r.visual_notes.trim().length > 0) {
    out.visual_notes = r.visual_notes.trim();
  }

  return out;
}
