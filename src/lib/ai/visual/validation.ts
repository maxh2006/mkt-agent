// Zod schemas for the visual input shapes. Defined here (standalone)
// rather than inside the existing brand/event validators so the shape
// can land without touching active API routes. The next task wires
// these into:
//   - Brand Management design_settings_json (extends the existing
//     brandDesignSchema shape)
//   - Event create/update schemas (new optional `visual_override` sub-object)
//
// Importing from this module does NOT affect the existing validators
// — it just makes the shape available for UI forms + tests today.

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
