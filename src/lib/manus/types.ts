// Types shared by the Manus handoff layer and the dispatcher.
// Kept deliberately flat so the shape is easy to replace/extend when the real
// Manus integration is wired.
//
// The contract documented here is the finalized MVP protocol between this
// app and Manus — see docs/00-architecture.md "Manus protocol — finalized
// contract" for the full specification (correlation keys, idempotency,
// error taxonomy).

/**
 * Machine-readable error classes Manus is expected to use on failed
 * deliveries. Accepted as free-form strings at the callback Zod boundary
 * so unknown codes don't reject the callback — we prefer forward compat
 * over strictness here. This union is the operator-visible canonical set.
 */
export type ManusErrorCode =
  | "AUTH_ERROR"               // Manus could not authenticate to the target platform
  | "NETWORK_ERROR"            // connection failure or timeout to the platform
  | "PLATFORM_REJECTED"        // platform returned a hard reject (policy, content rule)
  | "RATE_LIMITED"             // platform throttled the request
  | "INVALID_PAYLOAD"          // Manus believes our payload is malformed
  | "MEDIA_ERROR"              // image/video processing or upload failed
  | "TEMPORARY_UPSTREAM_ERROR" // transient platform outage; safe to retry later
  | "UNKNOWN_ERROR";           // fallback for unclassified failures

export interface ManusDispatchPayload {
  /** Stable correlation keys — Manus MUST echo both back in any callback. */
  post_id: string;
  delivery_id: string;

  /** Target platform for this single delivery. */
  platform: "instagram" | "facebook" | "twitter" | "tiktok" | "telegram";

  /** Brand context. */
  brand: {
    id: string;
    name: string;
  };

  /** The approved content payload. Source-of-truth is the parent Post; we snapshot
   *  the fields relevant for delivery. No regeneration, no re-approval happens here. */
  content: {
    headline: string | null;
    caption: string | null;
    cta: string | null;
    banner_text: string | null;
    image_prompt: string | null;
  };

  /** Scheduling context. */
  scheduled_for: string | null; // ISO string; null for immediate

  /** Optional source context for downstream logging/observability. */
  source: {
    post_type: string;
    source_type: string | null;
    source_id: string | null;
    source_instance_key: string | null;
  };

  /** Monotonic counter for retries at the delivery level. */
  retry_count: number;
}

/**
 * Synchronous response Manus returns from the dispatch HTTP call.
 *
 * Required: `accepted`, `dry_run`.
 * Optional: everything else. `accepted=true` means Manus has taken
 * responsibility for the job; actual posted/failed outcome arrives later via
 * the callback route (`POST /api/manus/callback`). `accepted=false` means
 * immediate rejection — our dispatcher does NOT reset the delivery to
 * `queued` on an immediate rejection in MVP; operator-triggered retry is the
 * recourse. Future work: wire a reconciler that demotes `publishing` rows
 * back to `failed` on `accepted=false`.
 */
export interface ManusDispatchResult {
  accepted: boolean;
  /** True when MANUS_AGENT_ENDPOINT is unset and we only logged the payload. */
  dry_run: boolean;
  /** Human-readable error message from Manus (or our handoff layer) when accepted=false. */
  error?: string;
  /** Machine-readable error class when accepted=false. See ManusErrorCode. */
  error_code?: ManusErrorCode;
  /**
   * Manus-side job reference. NOT the same as `external_post_id` (which is
   * the platform-side post identifier set on successful posted callback).
   * Currently logged by the dispatcher for operator correlation; not
   * persisted to PostPlatformDelivery in MVP — add a column when Manus
   * integration goes live if cross-system correlation becomes necessary.
   */
  external_ref?: string;
}

/**
 * Inbound callback payload from Manus (`POST /api/manus/callback`).
 *
 * Required: `delivery_id`, `outcome`.
 * Optional validation keys: `post_id`, `platform` — cross-checked against
 *   the stored delivery row; mismatches return 409.
 * Outcome-specific:
 *   - `outcome: "posted"` SHOULD include `external_post_id` (platform-side
 *     post id/URL). `error` and `error_code` are ignored on posted.
 *   - `outcome: "failed"` SHOULD include `error` (human-readable). `error_code`
 *     is recommended — the callback route formats `last_error` as
 *     `"[CODE] message"` when present.
 * `external_ref` is pass-through metadata (Manus-side job reference); logged
 * for correlation and not persisted in MVP.
 * `attempted_at` defaults to server-side `now()` when omitted.
 *
 * The Zod schema at the callback route is the source of truth for runtime
 * shape. This type mirrors it for server-side callers and test harnesses.
 */
export interface ManusCallbackPayload {
  delivery_id: string;
  post_id?: string;
  platform?: ManusDispatchPayload["platform"];
  outcome: "posted" | "failed";
  external_post_id?: string;
  error?: string;
  error_code?: ManusErrorCode;
  external_ref?: string;
  attempted_at?: string; // ISO datetime
}

export interface DispatcherSummary {
  picked: number;          // rows that matched the picker query
  claimed: number;         // rows atomically transitioned to publishing
  dispatched: number;      // rows the handoff layer accepted
  errors: Array<{
    delivery_id: string;
    platform: string;
    error: string;
  }>;
  dry_run: boolean;        // whether the handoff layer ran in dry-run mode
}
