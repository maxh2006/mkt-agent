import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PostType, SourceType } from "@/generated/prisma/enums";
import type {
  GeneratedSample,
  GenerationRunResult,
  NormalizedGenerationInput,
} from "./types";

/**
 * Turns generated samples into Content Queue draft rows.
 *
 * Writes one Post per sample, all sharing the same `sample_group_id` so
 * the Queue UI's existing sample-grouping chip ("Sample 1/3") renders
 * correctly (see src/app/api/posts/route.ts — enrichment logic reads
 * `generation_context_json.sample_group_id/index/total`).
 *
 * Every draft also carries the source snapshot + prompt version so:
 *   - Refine cycles can reuse the frozen source (Hot Games, events)
 *   - Future learning/eval work can replay generations from context
 *
 * Returns the created posts' ids + the shared run metadata (for audit /
 * API response). Does NOT create PostPlatformDelivery rows — delivery
 * rows are only written at approve/schedule time (see delivery-creator.ts).
 */
export async function insertSamplesAsDrafts(args: {
  input: NormalizedGenerationInput;
  samples: GeneratedSample[];
  provider: string;
  dry_run: boolean;
  created_by: string;
}): Promise<{ created_post_ids: string[]; meta: GenerationRunResult["meta"] }> {
  const { input, samples, provider, dry_run, created_by } = args;

  const now = new Date();
  const meta: GenerationRunResult["meta"] = {
    source_type: input.source_type,
    source_id: input.source_id,
    source_instance_key: input.source_instance_key,
    sample_group_id: input.sample_group_id,
    sample_total: samples.length,
    prompt_version: promptVersionFromEnv(),
    ai_provider: provider,
    ai_dry_run: dry_run,
    generated_at: now.toISOString(),
  };

  const rows: Prisma.PostCreateManyInput[] = samples.map((sample, index) => {
    const generationContext: Record<string, unknown> = {
      sample_group_id: input.sample_group_id,
      sample_index: index,
      sample_total: samples.length,
      source_type: input.source_type,
      source_snapshot: input.source_facts,
      prompt_version: meta.prompt_version,
      ai_provider: provider,
      ai_dry_run: dry_run,
      generated_at: meta.generated_at,
      effective_context_overrides: input.effective.overridden_by_event,
    };

    // Hot Games: mirror the existing refine contract — the refine modal
    // reads generation_context_json.type === "hot_games_snapshot" and
    // surfaces the frozen ranked-games list. Tag the node with `type`
    // alongside our new meta so both old and new consumers work.
    if (input.source_type === "hot_games" && input.source_facts.kind === "hot_games") {
      generationContext.type = "hot_games_snapshot";
      generationContext.scan_timestamp = input.source_facts.scan_timestamp;
      generationContext.source_window_minutes = input.source_facts.source_window_minutes;
      generationContext.ranked_games = input.source_facts.ranked_games;
    }

    return {
      brand_id: input.brand.id,
      post_type: input.post_type satisfies PostType,
      platform: input.platform,
      status: "draft",
      headline: sample.headline,
      caption: sample.caption,
      cta: sample.cta,
      banner_text: sample.banner_text,
      image_prompt: sample.image_prompt,
      source_type: input.source_type satisfies SourceType,
      source_id: input.source_id,
      source_instance_key: input.source_instance_key,
      generation_context_json: generationContext as Prisma.InputJsonValue,
      tracking_id: crypto.randomUUID(),
      created_by,
    };
  });

  // createMany doesn't return the created rows on Postgres, so we roll
  // our own create-many-with-ids loop within a transaction. Small N
  // (≤ a handful of samples per run) — no performance concern.
  const createdIds = await db.$transaction(
    rows.map((data) => db.post.create({ data, select: { id: true } })),
  );

  return {
    created_post_ids: createdIds.map((r) => r.id),
    meta,
  };
}

function promptVersionFromEnv(): string {
  // Read lazily so tests or future env overrides work without module
  // re-import. Falls back to whatever prompt-builder currently emits.
  //
  // (We avoid importing PROMPT_VERSION directly here to keep the
  // queue-inserter free of prompt-builder coupling for the mild benefit
  // of independent unit-testability.)
  return process.env.AI_PROMPT_VERSION ?? "v1-2026-04-21";
}
