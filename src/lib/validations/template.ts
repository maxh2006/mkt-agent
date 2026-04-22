import { z } from "zod";

// ─── Module role ──────────────────────────────────────────────────────────────
//
// Templates & Assets is a **reusable supporting library** that operators (and
// the future AI content generator) can draw from. It is NOT the authoritative
// source of AI rules — that belongs to Brand Management
// (positioning / tone / cta_style / language / audience / banned lists /
// notes_for_ai). Event briefs are the override layer. Templates & Assets
// sits alongside those layers as reusable building blocks, not a rule layer.
//
// See docs/07-ai-boundaries.md and docs/06-workflows-roles.md for the full
// AI context precedence model.

// ─── Template types ───────────────────────────────────────────────────────────
//
// The DB values (caption, banner, prompt, cta, asset) are stable for backward
// compatibility. Only the operator-facing labels + ordering have been
// updated (2026-04-22) to emphasize this module's "reusable library" role
// and to avoid overlap with Brand Management naming.

export const TEMPLATE_TYPES = ["caption", "banner", "prompt", "cta", "asset"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/**
 * Canonical operator-facing label (singular) per template type.
 * Used in dialog titles, card chips, and API error messages.
 */
export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  caption: "Copy Template",
  banner: "Banner Text Pattern",
  prompt: "Prompt Template",
  cta: "CTA Snippet",
  asset: "Reference Asset",
};

/**
 * Plural label — used for tab headers + empty-state text.
 */
export const TEMPLATE_TYPE_LABELS_PLURAL: Record<TemplateType, string> = {
  caption: "Copy Templates",
  banner: "Banner Text Patterns",
  prompt: "Prompt Templates",
  cta: "CTA Snippets",
  asset: "Reference Assets",
};

/**
 * Short helper text shown under each tab + inside the create/edit dialog.
 * Describes what to save here and how the AI generator is expected to
 * reuse it. Every helper emphasizes "reusable" over "authoritative".
 */
export const TEMPLATE_TYPE_HELPERS: Record<TemplateType, string> = {
  caption:
    "Reusable caption structures the AI can pull from as scaffolds. Save the pattern, not the exact wording — short vs. long hooks, layouts, recurring post shapes.",
  banner:
    "Short overlay-text patterns used on banner / image creatives. Punchy, 2–6 word structures the AI can slot brand values into.",
  prompt:
    "Image-generation prompt scaffolds the AI can reuse across creatives. Compose from brand identity + scene cues; avoid model-specific syntax.",
  cta:
    "Reusable call-to-action lines the AI can drop into drafts. Short, self-contained, platform-agnostic.",
  asset:
    "Reusable visual reference URLs the AI (or an operator) can cite across content. Distinct from Brand Management's benchmark assets — benchmarks define base brand identity; reference assets here are operational library material.",
};

/**
 * Canonical tab order (2026-04-22 — aligns with the target info
 * architecture: Copy → CTA → Banner → Prompt → Assets).
 */
export const TEMPLATE_TAB_ORDER: readonly TemplateType[] = [
  "caption",
  "cta",
  "banner",
  "prompt",
  "asset",
] as const;

// Asset sub-types (stored in config_json.asset_type)
export const ASSET_TYPES = ["image", "logo", "banner"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  image: "Image",
  logo: "Logo",
  banner: "Banner",
};

// ─── config_json shapes per template_type ─────────────────────────────────────

// caption / banner / prompt / cta — all carry a "content" text field.
// Require at least 1 char so an empty string can't be silently stored.
export const textTemplateConfigSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Content is required")
    .max(5000, "Content must be 5000 chars or less"),
  // Optional descriptive notes for operators.
  notes: z.string().trim().max(500).optional(),
});

// asset — carries a URL, no text content
export const assetConfigSchema = z.object({
  url: z.string().trim().url("Must be a valid URL").max(2048),
  asset_type: z.enum(ASSET_TYPES),
  notes: z.string().trim().max(500).optional(),
});

// Union — used for reading; writes go through per-type validation
export const templateConfigSchema = z.union([textTemplateConfigSchema, assetConfigSchema]);

export type TextTemplateConfig = z.infer<typeof textTemplateConfigSchema>;
export type AssetConfig = z.infer<typeof assetConfigSchema>;

// ─── Create schema ────────────────────────────────────────────────────────────

export const createTemplateSchema = z.discriminatedUnion("template_type", [
  z.object({
    template_type: z.enum(["caption", "banner", "prompt", "cta"]),
    name: z.string().trim().min(1, "Name is required").max(255),
    active: z.boolean().default(true),
    config: textTemplateConfigSchema,
  }),
  z.object({
    template_type: z.literal("asset"),
    name: z.string().trim().min(1, "Name is required").max(255),
    active: z.boolean().default(true),
    config: assetConfigSchema,
  }),
]);

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// ─── Update schema (all fields optional) ─────────────────────────────────────

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255).optional(),
  active: z.boolean().optional(),
  // config is validated at the API level after checking existing template_type
  config: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// ─── List query schema ────────────────────────────────────────────────────────

export const listTemplatesQuerySchema = z.object({
  template_type: z.enum(TEMPLATE_TYPES).optional(),
  active: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  include_global: z
    .string()
    .optional()
    .transform((v) => v !== "false"), // default true
});
