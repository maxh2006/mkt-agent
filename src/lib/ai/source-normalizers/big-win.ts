import { randomUUID } from "crypto";
import type { Platform } from "@/generated/prisma/enums";
import { resolveEffectiveContext } from "../resolve-context";
import { defaultSampleCount } from "./defaults";
import type {
  BigWinFacts,
  BrandContext,
  NormalizedGenerationInput,
} from "../types";

/**
 * Big Wins have no event override (they come from the shared BigQuery
 * feed). The normalizer just pairs facts with the brand and picks
 * per-brand sample count + platform.
 *
 * Note: `display_username` MUST already be masked per brand rules when
 * it reaches this normalizer. The mask logic lives in the source adapter
 * layer (future BQ wiring); this module does not re-process PII.
 */
export function normalizeBigWin(args: {
  brand: BrandContext;
  facts: BigWinFacts;
  platform: Platform;
  sample_count?: number;
}): NormalizedGenerationInput {
  const effective = resolveEffectiveContext(args.brand, null);
  return {
    source_type: "big_win",
    source_id: args.facts.source_row_key,
    source_instance_key: null,
    brand: args.brand,
    event: null,
    effective,
    source_facts: args.facts,
    post_type: "big_win",
    platform: args.platform,
    sample_count: args.sample_count ?? defaultSampleCount("big_win"),
    sample_group_id: randomUUID(),
  };
}
