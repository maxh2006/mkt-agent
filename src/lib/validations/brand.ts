import { z } from "zod";
import {
  brandVisualDefaultsSchema,
  DEFAULT_BRAND_VISUAL_DEFAULTS,
  type BrandVisualDefaultsInput,
} from "@/lib/ai/visual/validation";
import {
  VISUAL_STYLES,
  VISUAL_EMPHASES,
  MAIN_SUBJECT_TYPES,
  LAYOUT_FAMILIES,
  PLATFORM_FORMATS,
  type VisualStyle,
  type VisualEmphasis,
  type MainSubjectType,
  type LayoutFamily,
  type PlatformFormat,
} from "@/lib/ai/visual/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const optionalUrl = z.string().trim().max(2048).optional();
const optionalText = (maxLen: number) => z.string().trim().max(maxLen).optional();

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color (e.g. #FF0000)");
const optionalHex = hex.optional();

// ─── A. Basic Identity ────────────────────────────────────────────────────────
//
// Identity holds the brand's visible-name fields + colors. The Brand
// Positioning Statement is surfaced in the Identity tab UI but stored under
// `voice_settings_json.positioning` alongside other AI context fields — this
// avoids a schema migration and keeps all AI inputs colocated.
// Logo URLs moved to `design_settings_json.logos.{main,square,horizontal,vertical}`
// for the same reason.

export const brandIdentitySchema = z.object({
  name: z.string().trim().min(1, "Brand name is required").max(255),
  domain: z.string().trim().min(1, "Domain is required").max(255),
  primary_color: hex,
  secondary_color: hex,
  accent_color: hex,
  active: z.boolean().default(true),
});

export type BrandIdentity = z.infer<typeof brandIdentitySchema>;

// ─── B. Integration Settings ──────────────────────────────────────────────────
//
// Architecture context (2026-04-21):
// - Big Wins + Hot Games are backed by the SHARED BigQuery dataset (global,
//   not per-brand). The fields here are for operator-facing source mapping
//   notes only — not a full BigQuery config.
// - Running Promotions still comes from a per-brand API (api_base_url +
//   promo_list_endpoint).
// Legacy fields `big_win_endpoint`, `hot_games_endpoint`, generic `notes`
// are dropped from the form but left out of the schema — PATCH route
// replaces the entire JSON blob on save, so old values naturally disappear.

export const integrationSettingsSchema = z.object({
  integration_enabled: z.boolean().default(false),
  api_base_url: optionalUrl,
  external_brand_code: optionalText(100),
  promo_list_endpoint: optionalText(500),
  tracking_link_base: optionalUrl,
  source_mapping_notes: optionalText(2000),
});

export type IntegrationSettings = z.infer<typeof integrationSettingsSchema>;

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  integration_enabled: false,
  api_base_url: "",
  external_brand_code: "",
  promo_list_endpoint: "",
  tracking_link_base: "",
  source_mapping_notes: "",
};

// ─── C. Voice & Tone ──────────────────────────────────────────────────────────

export const TONES = ["professional", "casual", "playful", "bold", "trustworthy"] as const;
export const TONE_LABELS: Record<string, string> = {
  professional: "Professional — formal and authoritative",
  casual: "Casual — friendly and approachable",
  playful: "Playful — fun and light-hearted",
  bold: "Bold — confident and assertive",
  trustworthy: "Trustworthy — reliable and reassuring",
};

export const CTA_STYLES = ["minimal", "direct", "playful", "urgent"] as const;
export const CTA_STYLE_LABELS: Record<string, string> = {
  minimal: "Minimal — short and clean",
  direct: "Direct — clear call to action",
  playful: "Playful — fun and engaging",
  urgent: "Urgent — FOMO-driven",
};

export const EMOJI_LEVELS = ["none", "minimal", "moderate", "heavy"] as const;
export const EMOJI_LEVEL_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal (1–2 per post)",
  moderate: "Moderate (3–5 per post)",
  heavy: "Heavy (emoji-forward)",
};

// Voice schema carries the AI base-profile for each brand.
// - positioning: Brand Positioning Statement (surfaced in the Identity tab
//   UI but stored here so the AI prompt builder finds it alongside other
//   voice signals).
// - language_style / language_style_sample: replace the old
//   language_style/taglish_ratio enum pair. Free-text so operators can
//   describe the exact mix they want; sample gives AI an imitation anchor.
// - audience_persona + notes_for_ai: AI tone calibration + nuance bucket.
// - banned_topics: category-level guardrails; sibling to banned_phrases
//   (word-level).
export const voiceSettingsSchema = z.object({
  positioning: z
    .string()
    .trim()
    .min(50, "Positioning statement must be at least 50 characters")
    .max(200, "Positioning statement must be at most 200 characters"),
  tone: z.enum(TONES),
  cta_style: z.enum(CTA_STYLES),
  emoji_level: z.enum(EMOJI_LEVELS),
  language_style: z
    .string()
    .trim()
    .min(1, "Language style is required")
    .max(200),
  language_style_sample: z
    .string()
    .trim()
    .min(1, "Language style sample is required")
    .max(500),
  audience_persona: z
    .string()
    .trim()
    .min(1, "Audience persona is required")
    .max(500),
  notes_for_ai: z
    .string()
    .trim()
    .min(1, "Notes for AI is required")
    .max(1000),
  banned_phrases: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  banned_topics: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  default_hashtags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
});

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  positioning: "",
  tone: "casual",
  cta_style: "direct",
  emoji_level: "minimal",
  language_style: "",
  language_style_sample: "",
  audience_persona: "",
  notes_for_ai: "",
  banned_phrases: [],
  banned_topics: [],
  default_hashtags: [],
};

// ─── D. Design Elements ───────────────────────────────────────────────────────
//
// Empty strings are NOT silently stored — fields are optional, not
// ".or(literal(''))"-coerced. AI prompt builder should skip undefined/null
// fields rather than shipping empty strings.

export const brandLogosSchema = z.object({
  main: z.string().trim().url().optional().or(z.literal("")),
  square: z.string().trim().url().optional().or(z.literal("")),
  horizontal: z.string().trim().url().optional().or(z.literal("")),
  vertical: z.string().trim().url().optional().or(z.literal("")),
}).partial();

export const benchmarkAssetSchema = z.object({
  id: z.string().min(1),
  url: z.string().trim().min(1, "Asset URL is required").max(2048),
  label: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type BenchmarkAsset = z.infer<typeof benchmarkAssetSchema>;

// `visual_defaults` is the structured Simple Mode block authored by
// operators on the Brand Management Design tab. It feeds the hidden
// visual prompt compiler at `src/lib/ai/visual/compile.ts`. Optional on
// the wire so brands created before this UI shipped continue to validate;
// the form seeds DEFAULT_BRAND_VISUAL_DEFAULTS when missing on load.
// Legacy free-text design notes (`design_theme_notes`,
// `preferred_visual_style`, etc.) remain accepted for backward
// compatibility but are no longer the authoritative visual rule source —
// the structured `visual_defaults` block is.
export const designSettingsSchema = z.object({
  design_theme_notes: optionalText(2000),
  preferred_visual_style: optionalText(500),
  headline_style: optionalText(500),
  button_style: optionalText(500),
  promo_text_style: optionalText(500),
  color_usage_notes: optionalText(2000),
  logos: brandLogosSchema.optional(),
  benchmark_assets: z.array(benchmarkAssetSchema).max(20).optional(),
  visual_defaults: brandVisualDefaultsSchema.optional(),
});

export type DesignSettings = z.infer<typeof designSettingsSchema>;
export type BrandLogos = z.infer<typeof brandLogosSchema>;

export const DEFAULT_DESIGN_SETTINGS: DesignSettings = {
  design_theme_notes: undefined,
  preferred_visual_style: undefined,
  headline_style: undefined,
  button_style: undefined,
  promo_text_style: undefined,
  color_usage_notes: undefined,
  logos: { main: "", square: "", horizontal: "", vertical: "" },
  benchmark_assets: [],
  visual_defaults: { ...DEFAULT_BRAND_VISUAL_DEFAULTS },
};

// ─── Visual defaults — operator-facing labels + helper text ──────────────────
//
// Re-exports of the canonical enum values from `src/lib/ai/visual/types.ts`,
// paired with operator-friendly labels and short helpers. The Brand
// Management Design tab consumes these for Simple Mode controls.

export {
  VISUAL_STYLES,
  VISUAL_EMPHASES,
  MAIN_SUBJECT_TYPES,
  LAYOUT_FAMILIES,
  PLATFORM_FORMATS,
};
export type {
  VisualStyle,
  VisualEmphasis,
  MainSubjectType,
  LayoutFamily,
  PlatformFormat,
  BrandVisualDefaultsInput,
};

export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  photographic: "Photographic — realistic, camera-feel",
  illustrated: "Illustrated — 2D flat illustration",
  "3d": "3D — rendered, dimensional",
  vector: "Vector — clean shapes, bold colors",
  cinematic: "Cinematic — dramatic lighting, depth",
  minimalist: "Minimalist — sparse, high negative space",
};

export const VISUAL_EMPHASIS_LABELS: Record<VisualEmphasis, string> = {
  "reward-forward": "Reward-forward — the prize is the hero",
  "winner-forward": "Winner-forward — a person celebrating",
  "game-forward": "Game-forward — game artwork is the hero",
  "brand-forward": "Brand-forward — brand identity prominent",
  lifestyle: "Lifestyle — aspirational moment",
};

export const MAIN_SUBJECT_TYPE_LABELS: Record<MainSubjectType, string> = {
  human: "Human — person, face, hands",
  object: "Object — coin, trophy, bonus item",
  "game-element": "Game element — reel, card, chip, artwork",
  symbol: "Symbol — crown, star, spark, abstract mark",
  abstract: "Abstract — pattern, gradient, no literal subject",
};

export const LAYOUT_FAMILY_LABELS: Record<LayoutFamily, string> = {
  center_focus: "Center focus — subject centered, text below",
  left_split: "Left split — subject left, text right",
  right_split: "Right split — subject right, text left",
  bottom_heavy: "Bottom heavy — subject top, text dominant below",
};

export const PLATFORM_FORMAT_LABELS: Record<PlatformFormat, string> = {
  square: "Square (1:1) — IG / FB feed",
  portrait: "Portrait (4:5) — IG feed alt, TikTok, Reels",
  landscape: "Landscape (16:9) — FB / Twitter",
  story: "Story (9:16) — IG / FB stories",
};

// ─── E. Sample Captions ───────────────────────────────────────────────────────

export const sampleCaptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  type: z.string().trim().max(100).optional(),
  text: z.string().trim().min(1, "Caption text is required").max(5000),
  notes: z.string().trim().max(1000).optional(),
});

export type SampleCaption = z.infer<typeof sampleCaptionSchema>;

export const sampleCaptionsSchema = z.array(sampleCaptionSchema).max(50);

// ─── Create / Update combined schemas ─────────────────────────────────────────

export const createBrandSchema = z.object({
  identity: brandIdentitySchema,
  integration: integrationSettingsSchema.optional(),
  voice: voiceSettingsSchema,
  design: designSettingsSchema.optional(),
  sample_captions: sampleCaptionsSchema.optional(),
});

// Updates allow partial identity (individual column tweaks) but voice
// stays required-in-shape once you touch it.
export const updateBrandSchema = z.object({
  identity: brandIdentitySchema.partial().optional(),
  integration: integrationSettingsSchema.optional(),
  voice: voiceSettingsSchema.optional(),
  design: designSettingsSchema.optional(),
  sample_captions: sampleCaptionsSchema.optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

// ─── List query params ────────────────────────────────────────────────────────

export const listBrandsQuerySchema = z.object({
  search: z.string().max(255).optional(),
  active: z.enum(["true", "false"]).optional(),
});
