import { randomUUID } from "crypto";
import type { Platform } from "@/generated/prisma/enums";
import { resolveEffectiveContext } from "../resolve-context";
import { defaultSampleCount } from "./defaults";
import type {
  BrandContext,
  EventOverride,
  NormalizedGenerationInput,
} from "../types";

/**
 * Event-derived generation: ONE occurrence × ONE platform per call.
 * The caller loops across occurrences/platforms and invokes this for
 * each slot. Sample count defaults to 1 per slot (match existing event
 * draft behavior); callers can bump it up to get multiple samples per
 * slot if needed.
 *
 * Event brief is passed into resolveEffectiveContext() so tone / CTA /
 * audience / notes_for_ai override the brand defaults where the event
 * specifies them. Brand positioning stays fixed regardless.
 */
export function normalizeEvent(args: {
  brand: BrandContext;
  event: EventOverride;
  platform: Platform;
  sample_count?: number;
}): NormalizedGenerationInput {
  const effective = resolveEffectiveContext(args.brand, args.event);
  return {
    source_type: "event",
    source_id: args.event.id,
    source_instance_key: args.event.occurrence_iso,
    brand: args.brand,
    event: args.event,
    effective,
    source_facts: {
      kind: "event",
      title: args.event.title,
      objective: args.event.objective,
      rules: args.event.rules,
      reward: args.event.reward,
      theme: args.event.theme,
      target_audience: args.event.target_audience,
      occurrence_iso: args.event.occurrence_iso,
    },
    post_type: "event",
    platform: args.platform,
    sample_count: args.sample_count ?? defaultSampleCount("event"),
    sample_group_id: randomUUID(),
  };
}
