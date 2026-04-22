import { db } from "@/lib/db";
import { generateSamples } from "./client";
import { buildPrompt } from "./prompt-builder";
import { insertSamplesAsDrafts } from "./queue-inserter";
import { loadBrandContext, brandOr404 } from "./load-brand";
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
}> {
  const prompt = buildPrompt(args.input);
  const result = await generateSamples({ input: args.input, prompt });

  const inserted = await insertSamplesAsDrafts({
    input: args.input,
    samples: result.samples,
    provider: result.provider,
    dry_run: result.dry_run,
    created_by: args.created_by,
  });

  console.log(
    `[ai-generator] run complete source=${args.input.source_type} brand=${args.input.brand.id} platform=${args.input.platform} samples=${result.samples.length} provider=${result.provider} dry_run=${result.dry_run} group=${args.input.sample_group_id}`,
  );

  return {
    created_post_ids: inserted.created_post_ids,
    sample_count: result.samples.length,
    dry_run: result.dry_run,
    provider: result.provider,
    prompt_version: prompt.prompt_version,
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
