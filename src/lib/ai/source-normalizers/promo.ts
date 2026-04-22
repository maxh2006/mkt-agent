import { randomUUID } from "crypto";
import type { Platform } from "@/generated/prisma/enums";
import { resolveEffectiveContext } from "../resolve-context";
import { defaultSampleCount } from "./defaults";
import type {
  BrandContext,
  NormalizedGenerationInput,
  PromoFacts,
} from "../types";

/**
 * Running Promotions are per-brand API-sourced (not global BQ). No event
 * override — promos drive their own generation path.
 */
export function normalizePromo(args: {
  brand: BrandContext;
  facts: PromoFacts;
  platform: Platform;
  sample_count?: number;
}): NormalizedGenerationInput {
  const effective = resolveEffectiveContext(args.brand, null);
  return {
    source_type: "promo",
    source_id: args.facts.promo_id,
    source_instance_key: null,
    brand: args.brand,
    event: null,
    effective,
    source_facts: args.facts,
    post_type: "promo",
    platform: args.platform,
    sample_count: args.sample_count ?? defaultSampleCount("promo"),
    sample_group_id: randomUUID(),
  };
}
