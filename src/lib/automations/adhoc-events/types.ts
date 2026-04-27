// Result shapes for the Adhoc Event automation flow.
//
// Returned by `runAdhocEventsAutomation()` and surfaced verbatim by
// both the admin API route and the CLI wrapper. Operators / future ops
// dashboards / Cloud Scheduler triggers all consume the same JSON shape.
//
// Mirrors `src/lib/automations/running-promotions/types.ts` in spirit
// but with two structural differences that reflect Events' nature:
//   - The unit of work is the event (not the brand). Brand info is
//     embedded on each event summary; brands are not the top-level
//     loop because each brand can own many events.
//   - Each event has a window-based "is it due?" gate (occurrences in
//     [now, now + lookahead_hours]). Eligibility carries an explicit
//     reason field when the gate filters out an otherwise-eligible
//     event so operators can see why nothing happened.

/**
 * Per-slot error shape. A slot is one (occurrence × platform) pair
 * within an eligible event. Captured into the event summary's
 * `errors[]` so one slot failing doesn't lose visibility into the
 * whole event or run.
 */
export interface EventAutomationError {
  /** Where the failure happened in the per-event flow. */
  phase: "context_load" | "occurrences" | "dedupe" | "generate";
  /** ISO of the occurrence the failure scoped to (when applicable). */
  occurrence_iso?: string;
  /** Platform slot the failure scoped to (when applicable). */
  platform?: string;
  /** Human-readable message; truncated to keep summaries small. */
  message: string;
}

/**
 * Why an event was filtered out of the active processing path. When
 * `eligible: true` and the event still produced zero slots, the
 * `ineligible_reason` is set so operators can see at a glance whether
 * the event is mis-configured (missing dates) vs simply outside the
 * lookahead window.
 *
 * `eligible: false` cases (status off, brand inactive, opted out) are
 * filtered at the eligibility query level and never appear in
 * `events[]` — they're only surfaced when an `event_id_filter` is set
 * and the targeted event fails the gate.
 */
export type EventAutomationIneligibleReason =
  | "status_inactive"
  | "auto_generate_off"
  | "brand_inactive"
  | "missing_dates"
  | "no_occurrences_in_window";

export interface EventAutomationEventSummary {
  event_id: string;
  event_title: string;
  brand_id: string;
  brand_name: string;
  status: string;
  /**
   * True iff the event passed the eligibility query (status=active,
   * auto_generate_posts=true, brand.active=true). When the orchestrator
   * is filtered to a single event id that turns out to be ineligible
   * at that level, it's marked `eligible: false` with the reason set.
   */
  eligible: boolean;
  /** Set when the event passed the eligibility query but produced zero
   *  slots (e.g. zero occurrences in the lookahead window, or missing
   *  dates required for recurrence mode), OR when an event_id_filter
   *  was set against an ineligible event. */
  ineligible_reason?: EventAutomationIneligibleReason;
  /** Number of occurrences in the lookahead window. For Generate Now
   *  events this is 1 (synthetic occurrence at now). */
  occurrences_in_window: number;
  /** Resolved platform list for this event (from event.platform_scope
   *  or the MVP "facebook" fallback). */
  platforms: string[];
  /** (occurrence × platform) slots the orchestrator attempted (after
   *  dedupe). Equals occurrences_in_window × platforms.length minus
   *  skipped_dedupe_count. */
  slots_processed: number;
  /** Slots skipped because a draft already exists in Content Queue. */
  skipped_dedupe_count: number;
  /** Drafts created via runGeneration() (sums sample_count across all
   *  generated slots; default sample_count=1 in MVP). */
  generated_drafts_count: number;
  /** Per-slot errors. Empty array when clean. */
  errors: EventAutomationError[];
}

export interface EventAutomationRunResult {
  /** ISO timestamp the orchestrator started. */
  started_at: string;
  /** ISO timestamp the orchestrator finished. */
  finished_at: string;
  /** Wall-clock duration. */
  duration_ms: number;
  /** Lookahead window the run used (defaults to 24h). */
  lookahead_hours: number;
  /** Per-event summaries in eligibility-query order (start_at ASC). */
  events: EventAutomationEventSummary[];
  /** Roll-up across all events for at-a-glance ops visibility. */
  totals: {
    /** Events that matched the eligibility query. */
    events_scanned: number;
    /** Events that passed the eligibility query AND had ≥1 slot to
     *  process (occurrences in window AND not all dedupe-skipped). */
    events_eligible: number;
    /** (occurrence × platform) slots actually processed. */
    slots_processed: number;
    /** Slots skipped because a draft already exists. */
    skipped_dedupe: number;
    /** Drafts created. */
    drafts_generated: number;
    /** Total errors across all events / slots. */
    errors: number;
  };
}

export interface EventAutomationRunArgs {
  /** Optional: scope to a single brand id (verification path). */
  brand_id_filter?: string;
  /** Optional: scope to a single event id (verification path).
   *  Does NOT bypass `auto_generate_posts` — operators wanting to test
   *  an opted-out event use the manual `POST /api/events/[id]/generate-drafts`. */
  event_id_filter?: string;
  /** Optional override for the default 24h lookahead window. */
  lookahead_hours?: number;
  /** Optional: override "now" for testing. Note: this only affects the
   *  upper bound of the lookahead window (now + lookahead_hours).
   *  `generateOccurrences()` uses its own internal `new Date()` for the
   *  lower bound, so historical replay of past windows is not supported. */
  now?: Date;
}
