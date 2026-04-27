// Adhoc Event automation orchestrator (Phase 5 sub-bullet 4 — 2026-04-28).
//
// Sole entry point: `runAdhocEventsAutomation(args)`.
//
// Flow per invocation:
//   1. Resolve the automation creator (first admin — see
//      `src/lib/automations/get-creator.ts` for the temporary-shortcut
//      caveat).
//   2. Discover eligible events (active brand + active event +
//      auto_generate_posts opt-in).
//   3. For each event sequentially:
//      a. Compute occurrences in [now, now + LOOKAHEAD_HOURS]. Generate
//         Now events (no posting_instance_json) synthesize one
//         occurrence at `now`.
//      b. Skip the event when zero occurrences fall in the window or
//         required dates are missing for recurrence mode.
//      c. Load brand context.
//      d. For each (occurrence × platform) slot, dedup against existing
//         queue rows and (when not a dupe) run the AI generation
//         pipeline.
//   4. Write a single per-event audit log entry (existing
//      AuditAction.EVENT_DRAFTS_GENERATED, parallel to the manual
//      route) when any drafts were generated.
//   5. Return a structured per-event summary + roll-up totals.
//
// Fail-isolation contract (locked):
//   - One event's failure NEVER blocks other events.
//   - One slot's (occurrence × platform) failure NEVER blocks other
//     slots within that event.
//   - The only condition that prevents the orchestrator from
//     starting is a missing automation creator (no admin exists).
//
// What this module does NOT do (deliberately):
//   - cadence enforcement (Cloud Scheduler is the trigger, separate
//     infra step; orchestrator processes everything in scope per call)
//   - multi-sample-per-slot (locked at 1 for MVP — operators run the
//     manual route when they want sibling samples)
//   - auto-approval / delivery rows / publishing (drafts only)
//   - parallelism (predictable rate-limits today; revisit when
//     volume warrants)

import { db } from "@/lib/db";
import type { Platform } from "@/generated/prisma/enums";
import {
  parsePostingInstance,
  generateOccurrences,
  formatPostingInstance,
} from "@/lib/posting-instance";
import { loadBrandContext } from "@/lib/ai/load-brand";
import { runGeneration, normalizers } from "@/lib/ai/generate";
import { coerceEventVisualOverride } from "@/lib/ai/visual/validation";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { getAutomationCreator } from "@/lib/automations/get-creator";
import type { EventOverride } from "@/lib/ai/types";
import type {
  EventAutomationError,
  EventAutomationEventSummary,
  EventAutomationRunArgs,
  EventAutomationRunResult,
} from "./types";

/** Default lookahead window. Drafts appear ~24h before each scheduled
 *  occurrence — enough lead time for review/approve, prevents
 *  long-recurrence floods. Override-able via `args.lookahead_hours`. */
const DEFAULT_LOOKAHEAD_HOURS = 24;

/** MVP-ONLY platform fallback when an event has no platform_scope set.
 *  Mirrors the manual route's fallback at
 *  src/app/api/events/[id]/generate-drafts/route.ts:57-59. */
const MVP_DEFAULT_PLATFORMS: Platform[] = ["facebook"];

const ERROR_MESSAGE_MAX_LEN = 500;
const TITLE_MAX_LEN = 80;

export async function runAdhocEventsAutomation(
  args: EventAutomationRunArgs = {},
): Promise<EventAutomationRunResult> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  const now = args.now ?? new Date();
  const lookaheadHours = args.lookahead_hours ?? DEFAULT_LOOKAHEAD_HOURS;
  const windowEnd = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

  // Resolve the creator first so a config error fails fast — no
  // partial run before realizing we can't attribute drafts.
  const creator = await getAutomationCreator();

  // Eligibility: active brands × active events × operator opt-in.
  // brand_id_filter / event_id_filter narrow for verification runs.
  const events = await db.event.findMany({
    where: {
      status: "active",
      auto_generate_posts: true,
      brand: { active: true },
      ...(args.brand_id_filter ? { brand_id: args.brand_id_filter } : {}),
      ...(args.event_id_filter ? { id: args.event_id_filter } : {}),
    },
    include: {
      brand: { select: { id: true, name: true, active: true } },
    },
    orderBy: { start_at: "asc" },
  });

  const filterLabel = args.brand_id_filter
    ? ` filter=brand:${args.brand_id_filter}`
    : args.event_id_filter
    ? ` filter=event:${args.event_id_filter}`
    : "";
  console.log(
    `[automation:event] start lookahead_hours=${lookaheadHours} events=${events.length} creator=${creator.id}${filterLabel}`,
  );

  const summaries: EventAutomationEventSummary[] = [];

  for (const event of events) {
    const summary = await processEvent({
      event,
      creator_id: creator.id,
      now,
      windowEnd,
    });
    summaries.push(summary);
  }

  const finishedAt = Date.now();
  const finishedAtIso = new Date(finishedAt).toISOString();

  const totals = summaries.reduce(
    (acc, s) => {
      // events_eligible counts events that actually had work to do
      // (passed the window gate). The eligibility-query result count is
      // events_scanned. Events that passed the query but had no slots
      // (e.g. zero occurrences in window) are scanned but not eligible-
      // for-work in this run — operators should see both numbers.
      if (s.eligible && s.occurrences_in_window > 0) acc.events_eligible += 1;
      acc.slots_processed += s.slots_processed;
      acc.skipped_dedupe += s.skipped_dedupe_count;
      acc.drafts_generated += s.generated_drafts_count;
      acc.errors += s.errors.length;
      return acc;
    },
    {
      events_scanned: summaries.length,
      events_eligible: 0,
      slots_processed: 0,
      skipped_dedupe: 0,
      drafts_generated: 0,
      errors: 0,
    },
  );

  console.log(
    `[automation:event] done events_scanned=${totals.events_scanned} events_eligible=${totals.events_eligible} slots_processed=${totals.slots_processed} skipped_dedupe=${totals.skipped_dedupe} generated=${totals.drafts_generated} errors=${totals.errors} duration_ms=${finishedAt - startedAt}`,
  );

  return {
    started_at: startedAtIso,
    finished_at: finishedAtIso,
    duration_ms: finishedAt - startedAt,
    lookahead_hours: lookaheadHours,
    events: summaries,
    totals,
  };
}

// ─── Per-event processing ───────────────────────────────────────────────────

interface EventRow {
  id: string;
  title: string;
  status: string;
  start_at: Date | null;
  end_at: Date | null;
  posting_instance_json: unknown;
  platform_scope: unknown;
  visual_settings_json: unknown;
  theme: string | null;
  objective: string | null;
  rules: string | null;
  reward: string | null;
  target_audience: string | null;
  cta: string | null;
  tone: string | null;
  notes_for_ai: string | null;
  brand_id: string;
  brand: { id: string; name: string; active: boolean } | null;
}

async function processEvent(args: {
  event: EventRow;
  creator_id: string;
  now: Date;
  windowEnd: Date;
}): Promise<EventAutomationEventSummary> {
  const { event, creator_id, now, windowEnd } = args;
  const summary: EventAutomationEventSummary = {
    event_id: event.id,
    event_title: truncate(event.title, TITLE_MAX_LEN),
    brand_id: event.brand?.id ?? event.brand_id,
    brand_name: event.brand?.name ?? "(unknown)",
    status: event.status,
    eligible: true,
    occurrences_in_window: 0,
    platforms: [],
    slots_processed: 0,
    skipped_dedupe_count: 0,
    generated_drafts_count: 0,
    errors: [],
  };

  // Resolve occurrences. Generate Now path (null piConfig) synthesizes
  // one occurrence at `now`. Recurrence path requires both dates.
  let occurrences: Date[];
  try {
    const piConfig = parsePostingInstance(event.posting_instance_json);
    if (piConfig) {
      if (!event.start_at || !event.end_at) {
        summary.ineligible_reason = "missing_dates";
        logEvent(summary);
        return summary;
      }
      // generateOccurrences already filters to occurrences >= internal-now.
      // We additionally filter to <= windowEnd here.
      const all = generateOccurrences(piConfig, event.start_at, event.end_at);
      occurrences = all.filter((d) => d <= windowEnd);
    } else {
      // Generate Now: single immediate occurrence; matches the manual
      // route's `[new Date()]` fallback. Always inside [now, windowEnd]
      // by construction.
      occurrences = [now];
    }
  } catch (err) {
    summary.errors.push({
      phase: "occurrences",
      message: truncate(err instanceof Error ? err.message : String(err)),
    });
    logEvent(summary);
    return summary;
  }

  summary.occurrences_in_window = occurrences.length;

  if (occurrences.length === 0) {
    summary.ineligible_reason = "no_occurrences_in_window";
    logEvent(summary);
    return summary;
  }

  // Resolve platforms (mirror manual route).
  const platforms =
    Array.isArray(event.platform_scope) && (event.platform_scope as string[]).length > 0
      ? (event.platform_scope as string[])
      : MVP_DEFAULT_PLATFORMS;
  summary.platforms = platforms;

  // Load brand context. Failure here means brand became inactive
  // between query + processing or some other load-side issue.
  let brandContext;
  try {
    brandContext = await loadBrandContext(summary.brand_id);
    if (!brandContext) {
      summary.errors.push({
        phase: "context_load",
        message: "loadBrandContext returned null (brand inactive or missing)",
      });
      logEvent(summary);
      return summary;
    }
  } catch (err) {
    summary.errors.push({
      phase: "context_load",
      message: truncate(err instanceof Error ? err.message : String(err)),
    });
    logEvent(summary);
    return summary;
  }

  // Lift the event-level visual override block once per event (it's
  // the same for every slot).
  const eventVisualSettings = (() => {
    const v = coerceEventVisualOverride(event.visual_settings_json);
    return Object.keys(v).length > 0 ? v : null;
  })();

  // Posting instance summary for the EventOverride (used by prompt builder).
  const piConfig = parsePostingInstance(event.posting_instance_json);
  const postingSummary = piConfig ? formatPostingInstance(piConfig) : null;

  // Per-slot loop: occurrence × platform.
  for (const occ of occurrences) {
    const occurrenceIso = occ.toISOString();
    for (const platform of platforms) {
      // Dedup: exact-match (brand_id, source_type, source_id,
      // source_instance_key, platform). findFirst (not count) — cheaper,
      // clearer intent. Status-agnostic: rejected/failed prior drafts
      // still cause skip (same MVP discipline as Running Promotions).
      let existing: { id: string } | null;
      try {
        existing = await db.post.findFirst({
          where: {
            brand_id: summary.brand_id,
            source_type: "event",
            source_id: event.id,
            source_instance_key: occurrenceIso,
            platform: platform as Platform,
          },
          select: { id: true },
        });
      } catch (err) {
        summary.errors.push({
          phase: "dedupe",
          occurrence_iso: occurrenceIso,
          platform,
          message: truncate(err instanceof Error ? err.message : String(err)),
        });
        continue;
      }

      if (existing) {
        summary.skipped_dedupe_count += 1;
        continue;
      }

      // Build EventOverride (mirrors the manual route exactly so the
      // prompt builder receives the same shape regardless of which
      // path triggered generation).
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
        occurrence_iso: occurrenceIso,
        start_at: event.start_at ? event.start_at.toISOString() : null,
        end_at: event.end_at ? event.end_at.toISOString() : null,
        visual_settings: eventVisualSettings,
      };

      // Generate. Per-slot failure isolation: catch into errors[],
      // continue with next slot.
      try {
        const input = normalizers.normalizeEvent({
          brand: brandContext,
          event: eventOverride,
          platform: platform as Platform,
          sample_count: 1,
        });
        const result = await runGeneration({
          input,
          created_by: creator_id,
        });
        summary.slots_processed += 1;
        summary.generated_drafts_count += result.created_post_ids.length;
      } catch (err) {
        summary.errors.push({
          phase: "generate",
          occurrence_iso: occurrenceIso,
          platform,
          message: truncate(err instanceof Error ? err.message : String(err)),
        });
      }
    }
  }

  // Per-event audit log when we actually generated drafts. Reuses the
  // same AuditAction the manual route uses, with `automation: true`
  // in the after-state so audit consumers can distinguish.
  if (summary.generated_drafts_count > 0) {
    void writeAuditLog({
      brand_id: summary.brand_id,
      user_id: creator_id,
      action: AuditAction.EVENT_DRAFTS_GENERATED,
      entity_type: "event",
      entity_id: event.id,
      after: {
        drafts_created: summary.generated_drafts_count,
        slots_processed: summary.slots_processed,
        occurrences: summary.occurrences_in_window,
        platforms,
        samples_per_slot: 1,
        errors: summary.errors.length,
        automation: true,
        lookahead_hours_at_run:
          (windowEnd.getTime() - now.getTime()) / (60 * 60 * 1000),
      },
    });
  }

  logEvent(summary);
  return summary;
}

function logEvent(s: EventAutomationEventSummary): void {
  const reason = s.ineligible_reason ? ` reason=${s.ineligible_reason}` : "";
  console.log(
    `[automation:event] event=${s.event_id} brand=${s.brand_id} occurrences=${s.occurrences_in_window} slots=${s.slots_processed} skipped_dedupe=${s.skipped_dedupe_count} generated=${s.generated_drafts_count} errors=${s.errors.length}${reason}`,
  );
}

function truncate(s: string, max = ERROR_MESSAGE_MAX_LEN): string {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
