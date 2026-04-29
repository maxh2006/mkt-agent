import { db } from "@/lib/db";
import { generateSamples } from "./client";
import { buildPrompt } from "./prompt-builder";
import { insertSamplesAsDrafts } from "./queue-inserter";
import { loadBrandContext, brandOr404 } from "./load-brand";
import { loadBrandTemplates, countTemplates } from "./load-templates";
import { compileVisualPrompt, composeImagePromptStructuralAppendix } from "./visual/compile";
import { generateBackgroundImage } from "./image/client";
import { buildImageErrorResult, type BackgroundImageRequest, type BackgroundImageResult, type ImageProviderErrorCode } from "./image/types";
import { renderFinalImage } from "./render";
import { buildRenderErrorResult, type CompositedImageResult, type RenderRequest } from "./render/types";
import {
  isStorageConfigured,
  uploadCompositedPng,
  StorageError,
  classifyStorageError,
} from "@/lib/storage/gcs";
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

  // Per-sample image generation + composite (per-sample restructure
  // 2026-04-29). Each Claude-generated sample carries its own narrative
  // `image_prompt` describing a different visual concept; we feed each
  // one to Gemini separately so the 3 siblings produce 3 different
  // images. Brand visual constraints (safe zones, format, palette,
  // anti-text rule) are layered on via `composeImagePromptStructuralAppendix`.
  // Negative prompt + layout/safe-zone metadata still come from the
  // compiled visual prompt — operators set those at the brand level
  // and Claude doesn't override them.
  //
  // Failure isolation per slot: an error in sample i's image gen or
  // composite render produces an error-shaped result for that slot;
  // sibling slots continue. Text drafts still ship even when an entire
  // image pipeline fails for a sample.
  const provider = (process.env.AI_IMAGE_PROVIDER ?? "stub").toLowerCase() as BackgroundImageResult["provider"];
  const providerModel = process.env.AI_IMAGE_MODEL ?? null;
  const structuralAppendix = composeImagePromptStructuralAppendix({
    visual,
    brand_palette: {
      primary: args.input.brand.primary_color,
      secondary: args.input.brand.secondary_color,
      accent: args.input.brand.accent_color,
    },
  });

  const imageResults: BackgroundImageResult[] = [];
  const compositedResults: CompositedImageResult[] = [];
  const storageStatuses: Array<"uploaded" | "skipped" | "render_failed" | "upload_failed"> = [];

  for (let i = 0; i < result.samples.length; i++) {
    const sample = result.samples[i];
    const sampleImagePrompt = sample.image_prompt
      ? `${sample.image_prompt.trim()}\n\n${structuralAppendix}`
      : visual.background_image_prompt; // fall back to compiled prompt when Claude omitted image_prompt

    const imageRequest: BackgroundImageRequest = {
      background_image_prompt: sampleImagePrompt,
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
        `[ai-image] FAILED source=${args.input.source_type} brand=${args.input.brand.id} group=${args.input.sample_group_id} sample=${i} code=${code} err=${message}`,
      );
      imageResult = buildImageErrorResult({
        provider,
        model: providerModel,
        request: imageRequest,
        error_code: code,
        error_message: message,
        generated_at: imageGeneratedAt,
        duration_ms: Date.now() - imageStartedAt,
      });
    }
    imageResults.push(imageResult);

    // Overlay renderer — banner-only on the image (per-2026-04-29 audit).
    // Headline/caption/CTA stay in the post body when published.
    const renderRequest: RenderRequest = {
      background_artifact_url: imageResult.artifact_url,
      visual,
      text: {
        headline: null,
        caption: null,
        cta: null,
        banner: sample.banner_text ?? null,
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
        `[ai-render] FAILED source=${args.input.source_type} brand=${args.input.brand.id} group=${args.input.sample_group_id} sample=${i} err=${message}`,
      );
      composited = buildRenderErrorResult({
        request: renderRequest,
        error_code: "UNKNOWN",
        error_message: message,
        generated_at: renderGeneratedAt,
        duration_ms: Date.now() - renderStartedAt,
      });
    }

    let storageStatus: "uploaded" | "skipped" | "render_failed" | "upload_failed" = "skipped";
    if (composited.status === "ok" && composited.png_bytes && composited.png_bytes.byteLength > 0) {
      if (isStorageConfigured()) {
        try {
          const uploaded = await uploadCompositedPng({
            brand_id: args.input.brand.id,
            sample_group_id: args.input.sample_group_id,
            sample_index: i,
            bytes: composited.png_bytes,
          });
          composited.artifact_url = uploaded.url;
          composited.bucket = uploaded.bucket;
          composited.object_path = uploaded.object_path;
          composited.mime_type = uploaded.mime_type;
          composited.byte_length = uploaded.byte_length;
          composited.uploaded_at = uploaded.uploaded_at;
          storageStatus = "uploaded";
        } catch (err) {
          const code = err instanceof StorageError
            ? err.code
            : classifyStorageError(err instanceof Error ? err.message : String(err));
          const message = err instanceof Error ? err.message : String(err);
          composited.status = "error";
          composited.error_code = code as CompositedImageResult["error_code"];
          composited.error_message = truncateRenderMessage(message);
          composited.artifact_url = null;
          storageStatus = "upload_failed";
          console.warn(
            `[ai-render] storage upload FAILED brand=${args.input.brand.id} group=${args.input.sample_group_id} sample=${i} code=${code} err=${message}`,
          );
        }
      } else {
        storageStatus = "skipped";
      }
    } else if (composited.status !== "ok") {
      storageStatus = "render_failed";
    }

    compositedResults.push(composited);
    storageStatuses.push(storageStatus);
  }

  const inputWithMedia: NormalizedGenerationInput = {
    ...inputWithVisual,
    image_results: imageResults,
    composited_images: compositedResults,
  };

  const inserted = await insertSamplesAsDrafts({
    input: inputWithMedia,
    samples: result.samples,
    provider: result.provider,
    dry_run: result.dry_run,
    created_by: args.created_by,
    templates_injected: templatesInjected,
  });

  // Aggregate per-sample status into one log line. Counts only —
  // not individual sample details (those are in queue-inserter logs).
  const imageOk = imageResults.filter((r) => r.status === "ok").length;
  const compositeOk = compositedResults.filter((r) => r.status === "ok").length;
  const compositeFallback = compositedResults.filter((r) => r.background_fallback).length;
  const storageUploaded = storageStatuses.filter((s) => s === "uploaded").length;

  console.log(
    `[ai-generator] run complete source=${inputWithMedia.source_type} brand=${inputWithMedia.brand.id} platform=${inputWithMedia.platform} samples=${result.samples.length} provider=${result.provider} dry_run=${result.dry_run} group=${inputWithMedia.sample_group_id} layout=${visual.layout_key} emphasis=${visual.visual_emphasis} format=${visual.platform_format} overrides=[${visual.effective_inputs.overridden_by_event.join(",")}] images=${imageOk}/${result.samples.length} composites=${compositeOk}/${result.samples.length}${compositeFallback ? `/${compositeFallback}fallback` : ""} storage=${storageUploaded}/${result.samples.length} templates=copy:${templatesInjected.copy},cta:${templatesInjected.cta},banner:${templatesInjected.banner},prompt:${templatesInjected.prompt},asset:${templatesInjected.asset}`,
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

function truncateRenderMessage(s: string): string {
  if (!s) return "";
  return s.length <= 500 ? s : `${s.slice(0, 500)}…`;
}

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
