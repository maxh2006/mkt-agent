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
  /**
   * Per-bucket counts of Templates & Assets entries injected into the
   * prompt for this run. Recorded in generation_context_json for
   * future learning work (which template categories correlate with
   * approved/refined drafts). Template content itself is NOT
   * snapshotted — counts are enough.
   */
  templates_injected?: {
    copy: number;
    cta: number;
    banner: number;
    prompt: number;
    asset: number;
  };
}): Promise<{ created_post_ids: string[]; meta: GenerationRunResult["meta"] }> {
  const { input, samples, provider, dry_run, created_by, templates_injected } = args;

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
      // Per-bucket counts only — no template content snapshot. Enough
      // for future learning-loop work to correlate reuse with outcomes.
      templates_injected: templates_injected ?? {
        copy: 0, cta: 0, banner: 0, prompt: 0, asset: 0,
      },
    };

    // Phase 4: persist the compiled visual prompt + layout/safe-zone
    // spec so the future image-rendering provider + overlay renderer
    // can consume it without re-deriving anything. The orchestrator
    // populates `input.visual` via `compileVisualPrompt()`. Off-pipeline
    // call sites (test paths that build NormalizedGenerationInput by
    // hand) leave it undefined and we simply skip the block.
    if (input.visual) {
      const v = input.visual;
      generationContext.visual_compiled = {
        layout_key: v.layout_key,
        safe_zone_config: v.safe_zone_config,
        render_intent: v.render_intent,
        platform_format: v.platform_format,
        visual_emphasis: v.visual_emphasis,
        subject_focus: v.subject_focus,
        effective_inputs: v.effective_inputs,
        background_image_prompt: v.background_image_prompt,
        negative_prompt: v.negative_prompt,
      };
    }

    // Phase 4 (2026-04-27): persist the background-image provider
    // result. Shared across every sibling draft in this run — the
    // orchestrator runs the provider ONCE per run and replicates the
    // result here. Status is one of "ok" / "skipped" / "error";
    // `artifact_url` is null for the stub provider (placeholder) and
    // for any error / skipped path. The future overlay renderer reads
    // this block to fetch the background; until that ships, the block
    // is purely metadata. NOTE: `Post.image_url` is NOT touched — that
    // field is reserved for the FINAL composited asset produced by
    // the deferred overlay renderer.
    if (input.image_result) {
      const r = input.image_result;
      generationContext.image_generation = {
        provider: r.provider,
        model: r.model,
        status: r.status,
        artifact_url: r.artifact_url,
        provider_asset_id: r.provider_asset_id,
        width: r.width,
        height: r.height,
        background_image_prompt: r.background_image_prompt,
        negative_prompt: r.negative_prompt,
        skipped_reason: r.skipped_reason,
        error_code: r.error_code,
        error_message: r.error_message,
        generated_at: r.generated_at,
        duration_ms: r.duration_ms,
        render_version: r.render_version,
      };
    }

    // Phase 4 (2026-04-27): persist the deterministic overlay
    // renderer's composited image. Shared across siblings in this
    // run — orchestrator renders ONCE per run and the inserter
    // replicates here. `artifact_url` is a `data:image/png;base64,…`
    // URI in MVP; the GCS storage migration follow-up will swap it
    // for a hosted https URL (same field name; only the URL scheme
    // changes). NOTE: `Post.image_url` is STILL NOT touched — that
    // field stays gated on hosted URLs the Manus media-validation
    // path can dispatch. Operators see the composite as a preview in
    // the queue (image inspector UI is a separate follow-up).
    if (input.composited) {
      const c = input.composited;
      // Persist the composited_image block. NOTE: `c.png_bytes` is a
      // memory-only field used by the orchestrator to upload to GCS;
      // we deliberately don't include it here — the persisted
      // representation is `artifact_url` (https URL post-upload, or
      // a `data:` URI fallback when storage is unconfigured).
      generationContext.composited_image = {
        status: c.status,
        artifact_url: c.artifact_url,
        width: c.width,
        height: c.height,
        layout_key: c.layout_key,
        platform_format: c.platform_format,
        visual_emphasis: c.visual_emphasis,
        background_fallback: c.background_fallback,
        logo_drawn: c.logo_drawn,
        // GCS upload metadata (Phase 4 storage migration, 2026-04-27).
        // Present when the orchestrator's upload step succeeded;
        // null/absent when storage was unconfigured or upload failed.
        bucket: c.bucket ?? null,
        object_path: c.object_path ?? null,
        mime_type: c.mime_type ?? null,
        byte_length: c.byte_length ?? null,
        uploaded_at: c.uploaded_at ?? null,
        error_code: c.error_code,
        error_message: c.error_message,
        generated_at: c.generated_at,
        duration_ms: c.duration_ms,
        render_version: c.render_version,
      };
    }

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

    // Phase 4 storage migration (2026-04-27): auto-populate
    // `Post.image_url` ONLY when the composite was uploaded to GCS
    // and we have a real http(s) URL. The orchestrator sets
    // `composited.artifact_url` to the GCS URL on success; on
    // storage failure it's null; when storage is unconfigured it's
    // a `data:` URI (which Manus dispatch can't fetch). The
    // `https://` prefix check is the dispatch-safety gate.
    //
    // Operators retain the manual-override path: if they edit
    // `Post.image_url` later, that's preserved (we set it once at
    // creation; subsequent edits are operator-driven).
    const compositedUrl = input.composited?.artifact_url ?? null;
    const imageUrl =
      input.composited?.status === "ok" &&
      compositedUrl &&
      compositedUrl.startsWith("https://")
        ? compositedUrl
        : null;

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
      image_url: imageUrl,
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
  return process.env.AI_PROMPT_VERSION ?? "v3-2026-04-27";
}
