import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanEdit } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import {
  parsePostingInstance,
  generateOccurrences,
  formatPostingInstance,
} from "@/lib/posting-instance";
import { runGeneration, brandOr404, normalizers } from "@/lib/ai/generate";
import { coerceEventVisualOverride } from "@/lib/ai/visual/validation";
import type { Platform } from "@/generated/prisma/enums";
import type { EventOverride } from "@/lib/ai/types";

/**
 * POST /api/events/[id]/generate-drafts
 *
 * Phase 4: now runs each (occurrence × platform) slot through the AI
 * content generator (src/lib/ai/generate.ts) instead of creating empty
 * shell posts. Deduplication by (source_instance_key, platform) is
 * preserved — existing drafts are never re-generated.
 *
 * Default behaviour: one draft per slot (matches legacy event-generator
 * semantics). Pass `?samples_per_slot=N` to request multiple sibling
 * samples per slot. Samples within a slot share a `sample_group_id` via
 * the normalizer. Samples across slots belong to different groups.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanEdit(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;
  const event = await db.event.findFirst({
    where: { id, brand_id: ctx.brand!.id },
  });
  if (!event) return Errors.NOT_FOUND("Event");

  const piConfig = parsePostingInstance(event.posting_instance_json);

  // Recurrence mode requires start and end dates; Generate Now mode does not.
  if (piConfig && (!event.start_at || !event.end_at)) {
    return Errors.VALIDATION(
      "Event with a posting schedule must have start and end dates to generate drafts",
    );
  }

  const platforms = Array.isArray(event.platform_scope) && event.platform_scope.length > 0
    ? (event.platform_scope as string[])
    : ["facebook"];

  // If there's a posting schedule → recurrence occurrences; otherwise
  // (Generate Now) → one immediate occurrence.
  const occurrences = piConfig
    ? generateOccurrences(piConfig, event.start_at!, event.end_at!)
    : [new Date()];

  // Sample count per slot (defaults to 1 — matches legacy event draft count).
  const samplesPerSlotRaw = new URL(req.url).searchParams.get("samples_per_slot");
  const samplesPerSlot = (() => {
    if (!samplesPerSlotRaw) return 1;
    const n = parseInt(samplesPerSlotRaw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 5) return 1;
    return n;
  })();

  // Load the brand context once; all slots share it.
  const brand = await brandOr404(ctx.brand!.id).catch(() => null);
  if (!brand) return Errors.NOT_FOUND("Brand");

  // Dedupe: (source_instance_key, platform) pairs we've already created.
  const existingPosts = await db.post.findMany({
    where: { source_type: "event", source_id: event.id },
    select: { source_instance_key: true, platform: true },
  });
  const existingKeys = new Set(
    existingPosts.map((p) => `${p.source_instance_key}__${p.platform}`),
  );

  const postingSummary = piConfig ? formatPostingInstance(piConfig) : null;

  // Lift the event-level visual override block once per generation run
  // (it's the same for every slot). Empty / missing JSON resolves to
  // an empty object — null is what the visual compiler treats as "no
  // override; fall through to brand defaults".
  const eventVisualSettings = (() => {
    const v = coerceEventVisualOverride(event.visual_settings_json);
    return Object.keys(v).length > 0 ? v : null;
  })();

  let slotsProcessed = 0;
  let draftsCreated = 0;
  const errors: Array<{ occurrence: string; platform: string; error: string }> = [];

  for (const occ of occurrences) {
    const instanceKey = occ.toISOString();
    for (const plat of platforms) {
      const dedupeKey = `${instanceKey}__${plat}`;
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);
      slotsProcessed += 1;

      const eventOverride: EventOverride = {
        id: event.id,
        title: event.title,
        theme: event.theme,
        objective: event.objective,
        rules: event.rules,
        reward: event.reward,
        target_audience: event.target_audience,
        cta: event.cta,
        tone: event.tone,
        platform_scope: platforms,
        notes_for_ai: event.notes_for_ai,
        posting_instance_summary: postingSummary,
        occurrence_iso: instanceKey,
        start_at: event.start_at ? event.start_at.toISOString() : null,
        end_at: event.end_at ? event.end_at.toISOString() : null,
        visual_settings: eventVisualSettings,
      };

      const input = normalizers.normalizeEvent({
        brand,
        event: eventOverride,
        platform: plat as Platform,
        sample_count: samplesPerSlot,
      });

      try {
        const result = await runGeneration({ input, created_by: user.id });
        draftsCreated += result.created_post_ids.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.warn(
          `[ai-generator] event slot FAILED event=${event.id} occurrence=${instanceKey} platform=${plat} err=${msg}`,
        );
        errors.push({ occurrence: instanceKey, platform: plat, error: msg });
      }
    }
  }

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.EVENT_DRAFTS_GENERATED,
    entity_type: "event",
    entity_id: event.id,
    after: {
      drafts_created: draftsCreated,
      slots_processed: slotsProcessed,
      occurrences: occurrences.length,
      platforms,
      samples_per_slot: samplesPerSlot,
      errors: errors.length,
    },
  });

  return ok({
    created: draftsCreated,
    slots_processed: slotsProcessed,
    occurrences: occurrences.length,
    samples_per_slot: samplesPerSlot,
    errors,
  });
}
