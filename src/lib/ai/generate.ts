import { db } from "@/lib/db";
import { generateSamples } from "./client";
import { buildPrompt } from "./prompt-builder";
import { insertSamplesAsDrafts } from "./queue-inserter";
import { loadBrandContext, brandOr404 } from "./load-brand";
import { loadBrandTemplates, countTemplates } from "./load-templates";
import { compileVisualPrompt } from "./visual/compile";
import { generateBackgroundImage } from "./image/client";
import { buildImageErrorResult, type BackgroundImageRequest, type BackgroundImageResult, type ImageProviderErrorCode } from "./image/types";
import { renderFinalImage } from "./render";
import { buildRenderErrorResult, type CompositedImageResult, type RenderRequest } from "./render/types";
import type { NormalizedGenerationInput } from "./types";

/**
 * Orchestrator. Takes a NormalizedGenerationInput (produced by a
 * source-normalizer) and runs the full pipeline:
 *
 *   normalized input → prompt → provider client → samples → draft rows
 *
 * Returns the created post ids and the run metadata so callers (API
 * routes, dev endpoints) can respond with something useful.
 *
 * This is the single entry point for every generation flow. Per-source
 * routes (event drafts, BQ-scan handlers, promo-match handlers) only
 * have to produce the NormalizedGenerationInput; they never touch the
 * prompt builder, the provider, or the queue write path directly.
 */
export async function runGeneration(args: {
  input: NormalizedGenerationInput;
  created_by: string;
}): Promise<{
  created_post_ids: string[];
  sample_count: number;
  dry_run: boolean;
  provider: string;
  prompt_version: string;
  templates_injected: Record<keyof ReturnType<typeof countTemplates>, number>;
}> {
  // Attach the reusable Templates & Assets library before prompt build.
  // One retrieval per run — all sibling samples share the same library.
  // Empty buckets are valid; generation proceeds normally.
  const templates = await loadBrandTemplates(args.input.brand.id);

  // Compile the visual prompt + layout/safe-zone spec from the saved
  // Brand defaults (always present — loader fills with canonical
  // defaults) and the optional Event override. Pure function; runs
  // synchronously. The prompt builder reads it to surface a Visual
  // Direction section so the AI's narrative `image_prompt` aligns;
  // the queue inserter persists it under
  // `generation_context_json.visual_compiled` for the future image-
  // rendering provider + overlay renderer.
  const visual = compileVisualPrompt({
    brand: args.input.brand.visual_defaults,
    event: args.input.event?.visual_settings ?? null,
    platform: args.input.platform,
    source_facts: args.input.source_facts,
  });

  const inputWithVisual: NormalizedGenerationInput = {
    ...args.input,
    templates,
    visual,
  };
  const templatesInjected = countTemplates(templates);

  const prompt = buildPrompt(inputWithVisual);
  const result = await generateSamples({ input: inputWithVisual, prompt });

  // Background-image generation runs AFTER text generation so a slow or
  // flaky image provider never blocks text drafts. One image per run is
  // shared across every sibling draft (compiled visual prompt is the
  // same for siblings, and operators can refine later). Failure is
  // isolated — we synthesize an error result and continue to queue
  // insertion so the run still ships.
  const imageRequest: BackgroundImageRequest = {
    background_image_prompt: visual.background_image_prompt,
    negative_prompt: visual.negative_prompt,
    platform_format: visual.platform_format,
    layout_key: visual.layout_key,
    safe_zone_config: visual.safe_zone_config,
    subject_focus: visual.subject_focus,
    visual_emphasis: visual.visual_emphasis,
    brand_palette: {
      primary: args.input.brand.primary_color,
      secondary: args.input.brand.secondary_color,
      accent: args.input.brand.accent_color,
    },
    trace: {
      brand_id: args.input.brand.id,
      sample_group_id: args.input.sample_group_id,
      source_type: args.input.source_type,
      platform: args.input.platform,
    },
  };

  const imageStartedAt = Date.now();
  const imageGeneratedAt = new Date(imageStartedAt).toISOString();
  let imageResult: BackgroundImageResult;
  try {
    imageResult = await generateBackgroundImage(imageRequest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code: ImageProviderErrorCode = /not configured|env not set/i.test(message)
      ? "NOT_CONFIGURED"
      : "UNKNOWN";
    console.warn(
      `[ai-image] FAILED source=${args.input.source_type} brand=${args.input.brand.id} group=${args.input.sample_group_id} code=${code} err=${message}`,
    );
    imageResult = buildImageErrorResult({
      provider: (process.env.AI_IMAGE_PROVIDER ?? "stub").toLowerCase() as BackgroundImageResult["provider"],
      model: process.env.AI_IMAGE_MODEL ?? null,
      request: imageRequest,
      error_code: code,
      error_message: message,
      generated_at: imageGeneratedAt,
      duration_ms: Date.now() - imageStartedAt,
    });
  }

  const inputWithImage: NormalizedGenerationInput = {
    ...inputWithVisual,
    image_result: imageResult,
  };

  // Deterministic overlay renderer — composites Post text + brand
  // logo onto the AI background using the layout's safe zones / text
  // zones / logo slot. One composite per run; siblings share it (text
  // deltas are minor and per-sibling renders aren't worth the cost in
  // MVP). The first sample's text drives the composite. Failure path
  // mirrors image generation: the renderer returns a structured
  // error result rather than throwing, but we still wrap in try/catch
  // as belt-and-braces for unexpected throws (e.g. native binding
  // crashes from Resvg).
  const firstSample = result.samples[0];
  const renderRequest: RenderRequest = {
    background_artifact_url: imageResult.artifact_url,
    visual,
    text: {
      headline: firstSample?.headline ?? null,
      caption: firstSample?.caption ?? null,
      cta: firstSample?.cta ?? null,
      banner: firstSample?.banner_text ?? null,
    },
    brand: {
      name: args.input.brand.name,
      primary_color: args.input.brand.primary_color,
      secondary_color: args.input.brand.secondary_color,
      accent_color: args.input.brand.accent_color,
      logos: extractBrandLogos(args.input.brand.design),
    },
    trace: {
      brand_id: args.input.brand.id,
      sample_group_id: args.input.sample_group_id,
      source_type: args.input.source_type,
      platform: args.input.platform,
    },
  };

  const renderStartedAt = Date.now();
  const renderGeneratedAt = new Date(renderStartedAt).toISOString();
  let composited: CompositedImageResult;
  try {
    composited = await renderFinalImage(renderRequest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown render failure";
    console.warn(
      `[ai-render] FAILED source=${args.input.source_type} brand=${args.input.brand.id} group=${args.input.sample_group_id} err=${message}`,
    );
    composited = buildRenderErrorResult({
      request: renderRequest,
      error_code: "UNKNOWN",
      error_message: message,
      generated_at: renderGeneratedAt,
      duration_ms: Date.now() - renderStartedAt,
    });
  }

  const inputWithComposite: NormalizedGenerationInput = {
    ...inputWithImage,
    composited,
  };

  const inserted = await insertSamplesAsDrafts({
    input: inputWithComposite,
    samples: result.samples,
    provider: result.provider,
    dry_run: result.dry_run,
    created_by: args.created_by,
    templates_injected: templatesInjected,
  });

  console.log(
    `[ai-generator] run complete source=${inputWithComposite.source_type} brand=${inputWithComposite.brand.id} platform=${inputWithComposite.platform} samples=${result.samples.length} provider=${result.provider} dry_run=${result.dry_run} group=${inputWithComposite.sample_group_id} layout=${visual.layout_key} emphasis=${visual.visual_emphasis} format=${visual.platform_format} overrides=[${visual.effective_inputs.overridden_by_event.join(",")}] image=${imageResult.provider}:${imageResult.status} composite=${composited.status}${composited.background_fallback ? "/fallback" : ""} templates=copy:${templatesInjected.copy},cta:${templatesInjected.cta},banner:${templatesInjected.banner},prompt:${templatesInjected.prompt},asset:${templatesInjected.asset}`,
  );

  return {
    created_post_ids: inserted.created_post_ids,
    sample_count: result.samples.length,
    dry_run: result.dry_run,
    provider: result.provider,
    prompt_version: prompt.prompt_version,
    templates_injected: templatesInjected,
  };
}

// Re-export helpers callers typically need alongside the orchestrator.
export { loadBrandContext, brandOr404 };
export { buildPrompt } from "./prompt-builder";
export { resolveEffectiveContext } from "./resolve-context";
export * as normalizers from "./source-normalizers";
export * as fixtures from "./fixtures";

// Re-export key types so callers import from one place.
export type {
  BrandContext,
  EventOverride,
  EffectiveContext,
  NormalizedGenerationInput,
  GeneratedSample,
  SourceFacts,
} from "./types";

// Prisma helper stub — unused here but keeps bundlers happy if other
// modules import {db} transitively. (Intentionally referenced so the
// import is retained in build output.)
void db;

/**
 * Pulls the four brand-logo URLs out of `BrandContext.design` for the
 * renderer. The shape lives in `Brand.design_settings_json.logos`;
 * `loadBrandContext()` keeps the design block as a tolerant
 * `Record<string, unknown>` so we re-extract here. Missing / invalid
 * entries are returned as null — the renderer treats null as "skip
 * this logo variant" without erroring.
 */
function extractBrandLogos(
  design: NormalizedGenerationInput["brand"]["design"],
): RenderRequest["brand"]["logos"] {
  const logos = (design as Record<string, unknown>)?.logos;
  if (!logos || typeof logos !== "object") {
    return { main: null, square: null, horizontal: null, vertical: null };
  }
  const r = logos as Record<string, unknown>;
  const pick = (k: string): string | null => {
    const v = r[k];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };
  return {
    main: pick("main"),
    square: pick("square"),
    horizontal: pick("horizontal"),
    vertical: pick("vertical"),
  };
}
