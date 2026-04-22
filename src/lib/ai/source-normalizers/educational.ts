import { randomUUID } from "crypto";
import type { Platform } from "@/generated/prisma/enums";
import { resolveEffectiveContext } from "../resolve-context";
import { defaultSampleCount } from "./defaults";
import type {
  BrandContext,
  EducationalFacts,
  NormalizedGenerationInput,
} from "../types";

/**
 * Educational posts run off a minimal structured packet (topic + angle
 * + key_point + cta_goal). Phase 4 fixture-only; the live scheduling
 * layer for educational cadence lands in a later phase.
 */
export function normalizeEducational(args: {
  brand: BrandContext;
  facts: EducationalFacts;
  platform: Platform;
  sample_count?: number;
}): NormalizedGenerationInput {
  const effective = resolveEffectiveContext(args.brand, null);
  return {
    source_type: "educational",
    source_id: slugifyTopic(args.facts.topic),
    source_instance_key: null,
    brand: args.brand,
    event: null,
    effective,
    source_facts: args.facts,
    post_type: "educational",
    platform: args.platform,
    sample_count: args.sample_count ?? defaultSampleCount("educational"),
    sample_group_id: randomUUID(),
  };
}

function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "edu";
}
