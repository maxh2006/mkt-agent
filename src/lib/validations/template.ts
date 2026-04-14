import { z } from "zod";

// ─── Template types ───────────────────────────────────────────────────────────

export const TEMPLATE_TYPES = ["caption", "banner", "prompt", "cta", "asset"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  caption: "Caption",
  banner: "Banner Text",
  prompt: "Image Prompt",
  cta: "CTA Snippet",
  asset: "Asset",
};

// Asset sub-types (stored in config_json.asset_type)
export const ASSET_TYPES = ["image", "logo", "banner"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  image: "Image",
  logo: "Logo",
  banner: "Banner",
};

// ─── config_json shapes per template_type ─────────────────────────────────────

// caption / banner / prompt / cta — all carry a "content" text field
export const textTemplateConfigSchema = z.object({
  content: z.string().max(5000, "Content must be 5000 chars or less"),
  // Optional descriptive notes for operators
  notes: z.string().max(500).optional(),
});

// asset — carries a URL, no text content
export const assetConfigSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048),
  asset_type: z.enum(ASSET_TYPES),
  notes: z.string().max(500).optional(),
});

// Union — used for reading; writes go through per-type validation
export const templateConfigSchema = z.union([textTemplateConfigSchema, assetConfigSchema]);

export type TextTemplateConfig = z.infer<typeof textTemplateConfigSchema>;
export type AssetConfig = z.infer<typeof assetConfigSchema>;

// ─── Create schema ────────────────────────────────────────────────────────────

export const createTemplateSchema = z.discriminatedUnion("template_type", [
  z.object({
    template_type: z.enum(["caption", "banner", "prompt", "cta"]),
    name: z.string().min(1, "Name is required").max(255),
    active: z.boolean().default(true),
    config: textTemplateConfigSchema,
  }),
  z.object({
    template_type: z.literal("asset"),
    name: z.string().min(1, "Name is required").max(255),
    active: z.boolean().default(true),
    config: assetConfigSchema,
  }),
]);

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// ─── Update schema (all fields optional) ─────────────────────────────────────

export const updateTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255).optional(),
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
