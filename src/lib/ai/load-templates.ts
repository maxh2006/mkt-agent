import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type {
  AssetType,
  TemplateType,
} from "@/lib/validations/template";
import type { BrandTemplates, ReferenceAssetRef, TemplateRef } from "./types";

/**
 * Per-type caps on how many library entries are injected into a single
 * prompt. Chosen conservatively to bound prompt tokens. Callers may
 * override for tests / special flows.
 */
export interface TemplateCaps {
  copy: number;
  cta: number;
  banner: number;
  prompt: number;
  asset: number;
}

export const DEFAULT_TEMPLATE_CAPS: TemplateCaps = {
  copy: 3,
  cta: 5,
  banner: 5,
  prompt: 3,
  asset: 5,
};

/**
 * Fetch Templates & Assets to inject into a generation run.
 *
 * Strategy (intentionally deterministic — no ranking, no embeddings):
 *   - Only `active = true` entries.
 *   - Brand-scoped entries first (prefer operator-curated content),
 *     then top up from globals (brand_id IS NULL) until the cap is hit.
 *   - Ordered by `updated_at DESC` within each bucket so recent
 *     operator edits win.
 *
 * Precedence invariant: these entries are presented to the model as
 * OPTIONAL reference patterns. The prompt builder frames them
 * accordingly and the system instruction hard-rules that they never
 * override Brand / Source Facts / Event Brief.
 *
 * Missing brand or missing templates return all-empty buckets — the
 * pipeline still runs.
 */
export async function loadBrandTemplates(
  brandId: string,
  caps: TemplateCaps = DEFAULT_TEMPLATE_CAPS,
): Promise<BrandTemplates> {
  const [copyRows, ctaRows, bannerRows, promptRows, assetRows] = await Promise.all([
    loadByType(brandId, "caption", caps.copy),
    loadByType(brandId, "cta", caps.cta),
    loadByType(brandId, "banner", caps.banner),
    loadByType(brandId, "prompt", caps.prompt),
    loadByType(brandId, "asset", caps.asset),
  ]);

  return {
    copy: copyRows.map(toTextRef),
    cta: ctaRows.map(toTextRef),
    banner: bannerRows.map(toTextRef),
    prompt: promptRows.map(toTextRef),
    asset: assetRows.map(toAssetRef),
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface TemplateRow {
  id: string;
  brand_id: string | null;
  name: string;
  config_json: Prisma.JsonValue;
}

/**
 * Fetch up to `cap` active entries for a template type. Brand-scoped
 * first, then globals. We over-fetch (take: cap * 2) per bucket so
 * short-name collisions / inactive rows / null configs still let us
 * reach `cap` total; client-side truncation is then free of edge cases.
 */
async function loadByType(
  brandId: string,
  templateType: TemplateType,
  cap: number,
): Promise<TemplateRow[]> {
  if (cap <= 0) return [];

  const [brandScoped, globals] = await Promise.all([
    db.template.findMany({
      where: { brand_id: brandId, template_type: templateType, active: true },
      select: { id: true, brand_id: true, name: true, config_json: true },
      orderBy: { updated_at: "desc" },
      take: cap * 2,
    }),
    db.template.findMany({
      where: { brand_id: null, template_type: templateType, active: true },
      select: { id: true, brand_id: true, name: true, config_json: true },
      orderBy: { updated_at: "desc" },
      take: cap * 2,
    }),
  ]);

  // Brand-scoped first, then top up from globals; truncate at cap.
  return [...brandScoped, ...globals].slice(0, cap);
}

function toTextRef(row: TemplateRow): TemplateRef {
  const cfg = (row.config_json ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    content: typeof cfg.content === "string" ? cfg.content : "",
    notes: typeof cfg.notes === "string" && cfg.notes.trim() ? cfg.notes : undefined,
    is_global: row.brand_id === null,
  };
}

function toAssetRef(row: TemplateRow): ReferenceAssetRef {
  const cfg = (row.config_json ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    url: typeof cfg.url === "string" ? cfg.url : "",
    asset_type: (typeof cfg.asset_type === "string" ? cfg.asset_type : "image") as AssetType,
    notes: typeof cfg.notes === "string" && cfg.notes.trim() ? cfg.notes : undefined,
    is_global: row.brand_id === null,
  };
}

/**
 * Returns flat per-bucket counts — handy for logging and for the
 * `templates_injected` metadata the queue inserter writes into
 * `generation_context_json`.
 */
export function countTemplates(t: BrandTemplates): Record<keyof BrandTemplates, number> {
  return {
    copy: t.copy.length,
    cta: t.cta.length,
    banner: t.banner.length,
    prompt: t.prompt.length,
    asset: t.asset.length,
  };
}

/** Convenience zero-value used when no brand is available or retrieval is skipped. */
export const EMPTY_BRAND_TEMPLATES: BrandTemplates = {
  copy: [],
  cta: [],
  banner: [],
  prompt: [],
  asset: [],
};
