import { randomUUID } from "crypto";
import type { Platform } from "@/generated/prisma/enums";
import { resolveEffectiveContext } from "../resolve-context";
import { defaultSampleCount } from "./defaults";
import type {
  BrandContext,
  HotGamesFacts,
  NormalizedGenerationInput,
} from "../types";

/**
 * Hot Games are driven off a BigQuery scan. The scan timestamp +
 * source_window_minutes frozen here IS the source snapshot — refine
 * cycles MUST reuse it (see docs/07-ai-boundaries.md "Hot Games Frozen
 * Snapshot"). The queue inserter writes facts into generation_context_json
 * so subsequent refines can reach it without re-scanning.
 */
export function normalizeHotGames(args: {
  brand: BrandContext;
  facts: HotGamesFacts;
  platform: Platform;
  sample_count?: number;
}): NormalizedGenerationInput {
  const effective = resolveEffectiveContext(args.brand, null);
  // source_id: scan timestamp is stable + unique per scan
  return {
    source_type: "hot_games",
    source_id: args.facts.scan_timestamp,
    source_instance_key: args.facts.time_slot_summary,
    brand: args.brand,
    event: null,
    effective,
    source_facts: args.facts,
    post_type: "hot_games",
    platform: args.platform,
    sample_count: args.sample_count ?? defaultSampleCount("hot_games"),
    sample_group_id: randomUUID(),
  };
}
