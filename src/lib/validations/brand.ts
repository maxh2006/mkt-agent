import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const optionalUrl = z
  .string()
  .max(2048)
  .optional()
  .or(z.literal(""));

const optionalHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color (e.g. #FF0000)")
  .optional()
  .or(z.literal(""));

// ─── A. Basic Identity ─────────────────────────────────────────────────────────

export const brandIdentitySchema = z.object({
  name: z.string().min(1, "Brand name is required").max(255),
  domain: z.string().max(255).optional().or(z.literal("")),
  logo_url: optionalUrl,
  primary_color: optionalHex,
  secondary_color: optionalHex,
  accent_color: optionalHex,
  active: z.boolean().default(true),
});

export type BrandIdentity = z.infer<typeof brandIdentitySchema>;

// ─── B. Integration Settings ──────────────────────────────────────────────────

export const integrationSettingsSchema = z.object({
  integration_enabled: z.boolean().default(false),
  api_base_url: optionalUrl,
  external_brand_code: z.string().max(100).optional().or(z.literal("")),
  big_win_endpoint: z.string().max(500).optional().or(z.literal("")),
  promo_list_endpoint: z.string().max(500).optional().or(z.literal("")),
  tracking_link_base: optionalUrl,
  hot_games_endpoint: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type IntegrationSettings = z.infer<typeof integrationSettingsSchema>;

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  integration_enabled: false,
  api_base_url: "",
  external_brand_code: "",
  big_win_endpoint: "",
  promo_list_endpoint: "",
  tracking_link_base: "",
  hot_games_endpoint: "",
  notes: "",
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

export const LANGUAGE_STYLES = ["english_only", "mostly_english", "balanced_taglish", "mostly_taglish"] as const;
export const LANGUAGE_STYLE_LABELS: Record<string, string> = {
  english_only: "English only",
  mostly_english: "Mostly English, some Tagalog",
  balanced_taglish: "Balanced Taglish",
  mostly_taglish: "Mostly Taglish",
};

export const TAGLISH_RATIOS = ["full_english", "mostly_english", "balanced", "mostly_taglish"] as const;
export const TAGLISH_RATIO_LABELS: Record<string, string> = {
  full_english: "Full English",
  mostly_english: "Mostly English",
  balanced: "Balanced mix",
  mostly_taglish: "Mostly Taglish",
};

export const EMOJI_LEVELS = ["none", "minimal", "moderate", "heavy"] as const;
export const EMOJI_LEVEL_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal (1–2 per post)",
  moderate: "Moderate (3–5 per post)",
  heavy: "Heavy (emoji-forward)",
};

export const voiceSettingsSchema = z.object({
  tone: z.enum(TONES).optional(),
  cta_style: z.enum(CTA_STYLES).optional(),
  language_style: z.enum(LANGUAGE_STYLES).optional(),
  taglish_ratio: z.enum(TAGLISH_RATIOS).optional(),
  emoji_level: z.enum(EMOJI_LEVELS).optional(),
  banned_phrases: z.array(z.string().max(100)).max(50).optional(),
  default_hashtags: z.array(z.string().max(100)).max(30).optional(),
});

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  tone: "casual",
  cta_style: "direct",
  language_style: "mostly_english",
  taglish_ratio: "mostly_english",
  emoji_level: "minimal",
  banned_phrases: [],
  default_hashtags: [],
};

// ─── D. Design Elements ───────────────────────────────────────────────────────

export const designSettingsSchema = z.object({
  design_theme_notes: z.string().max(2000).optional().or(z.literal("")),
  preferred_visual_style: z.string().max(500).optional().or(z.literal("")),
  headline_style: z.string().max(500).optional().or(z.literal("")),
  button_style: z.string().max(500).optional().or(z.literal("")),
  promo_text_style: z.string().max(500).optional().or(z.literal("")),
  color_usage_notes: z.string().max(2000).optional().or(z.literal("")),
});

export type DesignSettings = z.infer<typeof designSettingsSchema>;

export const DEFAULT_DESIGN_SETTINGS: DesignSettings = {
  design_theme_notes: "",
  preferred_visual_style: "",
  headline_style: "",
  button_style: "",
  promo_text_style: "",
  color_usage_notes: "",
};

// ─── E. Sample Captions ───────────────────────────────────────────────────────

export const sampleCaptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200).optional().or(z.literal("")),
  type: z.string().max(100).optional().or(z.literal("")),
  text: z.string().max(5000),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type SampleCaption = z.infer<typeof sampleCaptionSchema>;

export const sampleCaptionsSchema = z.array(sampleCaptionSchema).max(50);

// ─── Create / Update combined schemas ────────────────────────────────────────

export const createBrandSchema = z.object({
  identity: brandIdentitySchema,
  integration: integrationSettingsSchema.optional(),
  voice: voiceSettingsSchema.optional(),
  design: designSettingsSchema.optional(),
  sample_captions: sampleCaptionsSchema.optional(),
});

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
