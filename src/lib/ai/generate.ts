import { db } from "@/lib/db";
import { generateSamples } from "./client";
import { buildPrompt } from "./prompt-builder";
import { insertSamplesAsDrafts } from "./queue-inserter";
import { loadBrandContext, brandOr404 } from "./load-brand";
import { loadBrandTemplates, countTemplates } from "./load-templates";
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
  const inputWithTemplates: NormalizedGenerationInput = {
    ...args.input,
    templates,
  };
  const templatesInjected = countTemplates(templates);

  const prompt = buildPrompt(inputWithTemplates);
  const result = await generateSamples({ input: inputWithTemplates, prompt });

  const inserted = await insertSamplesAsDrafts({
    input: inputWithTemplates,
    samples: result.samples,
    provider: result.provider,
    dry_run: result.dry_run,
    created_by: args.created_by,
    templates_injected: templatesInjected,
  });

  console.log(
    `[ai-generator] run complete source=${inputWithTemplates.source_type} brand=${inputWithTemplates.brand.id} platform=${inputWithTemplates.platform} samples=${result.samples.length} provider=${result.provider} dry_run=${result.dry_run} group=${inputWithTemplates.sample_group_id} templates=copy:${templatesInjected.copy},cta:${templatesInjected.cta},banner:${templatesInjected.banner},prompt:${templatesInjected.prompt},asset:${templatesInjected.asset}`,
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
