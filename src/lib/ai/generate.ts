import { db } from "@/lib/db";
import { generateSamples } from "./client";
import { buildPrompt } from "./prompt-builder";
import { insertSamplesAsDrafts } from "./queue-inserter";
import { loadBrandContext, brandOr404 } from "./load-brand";
import { loadBrandTemplates, countTemplates } from "./load-templates";
import { compileVisualPrompt } from "./visual/compile";
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

  const inserted = await insertSamplesAsDrafts({
    input: inputWithVisual,
    samples: result.samples,
    provider: result.provider,
    dry_run: result.dry_run,
    created_by: args.created_by,
    templates_injected: templatesInjected,
  });

  console.log(
    `[ai-generator] run complete source=${inputWithVisual.source_type} brand=${inputWithVisual.brand.id} platform=${inputWithVisual.platform} samples=${result.samples.length} provider=${result.provider} dry_run=${result.dry_run} group=${inputWithVisual.sample_group_id} layout=${visual.layout_key} emphasis=${visual.visual_emphasis} format=${visual.platform_format} overrides=[${visual.effective_inputs.overridden_by_event.join(",")}] templates=copy:${templatesInjected.copy},cta:${templatesInjected.cta},banner:${templatesInjected.banner},prompt:${templatesInjected.prompt},asset:${templatesInjected.asset}`,
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
