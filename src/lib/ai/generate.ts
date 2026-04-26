import { db } from "@/lib/db";
import { generateSamples } from "./client";
import { buildPrompt } from "./prompt-builder";
import { insertSamplesAsDrafts } from "./queue-inserter";
import { loadBrandContext, brandOr404 } from "./load-brand";
import { loadBrandTemplates, countTemplates } from "./load-templates";
import { compileVisualPrompt } from "./visual/compile";
import { generateBackgroundImage } from "./image/client";
import { buildImageErrorResult, type BackgroundImageRequest, type BackgroundImageResult, type ImageProviderErrorCode } from "./image/types";
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

  const inserted = await insertSamplesAsDrafts({
    input: inputWithImage,
    samples: result.samples,
    provider: result.provider,
    dry_run: result.dry_run,
    created_by: args.created_by,
    templates_injected: templatesInjected,
  });

  console.log(
    `[ai-generator] run complete source=${inputWithImage.source_type} brand=${inputWithImage.brand.id} platform=${inputWithImage.platform} samples=${result.samples.length} provider=${result.provider} dry_run=${result.dry_run} group=${inputWithImage.sample_group_id} layout=${visual.layout_key} emphasis=${visual.visual_emphasis} format=${visual.platform_format} overrides=[${visual.effective_inputs.overridden_by_event.join(",")}] image=${imageResult.provider}:${imageResult.status} templates=copy:${templatesInjected.copy},cta:${templatesInjected.cta},banner:${templatesInjected.banner},prompt:${templatesInjected.prompt},asset:${templatesInjected.asset}`,
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
