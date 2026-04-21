// Types shared by the Manus handoff layer and the dispatcher.
// Kept deliberately flat so the shape is easy to replace/extend when the real
// Manus integration is wired.

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

export interface ManusDispatchResult {
  accepted: boolean;
  /** True when MANUS_AGENT_ENDPOINT is unset and we only logged the payload. */
  dry_run: boolean;
  /** Error message surfaced by the handoff layer (network failure, non-2xx, etc.). */
  error?: string;
  /** Optional: external reference returned by Manus if the protocol already supports it. */
  external_ref?: string;
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
