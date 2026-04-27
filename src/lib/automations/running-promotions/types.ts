// Result shapes for the Running Promotions automation flow.
//
// Returned by `runRunningPromotionsAutomation()` and surfaced
// verbatim by both the admin API route and the CLI wrapper.
// Operators / future ops dashboards read these to answer:
//   - Which brands ran?
//   - How many promos were fetched per brand?
//   - How many were skipped as already-generated dedupe hits?
//   - How many drafts were generated?
//   - What failed and where?

import type { PromoAdapterErrorCode } from "@/lib/promotions/types";

/**
 * Per-promo / per-platform error shape. Captured into the brand
 * summary's `errors[]` so one promo failing doesn't lose visibility
 * into the whole run.
 */
export interface PromoAutomationError {
  /** Where the failure happened in the per-brand flow. */
  phase: "context_load" | "fetch" | "dedupe" | "generate";
  /** Upstream promo id, when the failure scoped to a specific promo. */
  promo_id?: string;
  /** Platform slot, when the failure scoped to a specific platform. */
  platform?: string;
  /** Human-readable message; truncated to keep summaries small. */
  message: string;
}

export interface PromoAutomationBrandSummary {
  brand_id: string;
  brand_name: string;
  /**
   * True iff the brand was in the eligibility query's result set
   * (active brand + active running_promotion rule). When the
   * orchestrator is filtered to a single brand id that turns out
   * to be ineligible, it's omitted from `result.brands` entirely
   * rather than appearing here as `eligible: false` — keeps the
   * summary clean.
   */
  eligible: true;
  /** Count of well-formed `PromoFacts` returned by the adapter. */
  fetched_count: number;
  /** Promos skipped because a draft already exists in the queue. */
  skipped_dedupe_count: number;
  /** Drafts created via runGeneration() (sums sample_count across
   *  all generated promo × platform slots). */
  generated_drafts_count: number;
  /** Per-promo / per-platform errors. Empty array when clean. */
  errors: PromoAutomationError[];
  /** Adapter-level error code when the brand-wide fetch failed
   *  (e.g. BRAND_NOT_CONFIGURED, NETWORK_ERROR). When set, no
   *  promos were processed for this brand. */
  fetch_error_code?: PromoAdapterErrorCode;
}

export interface PromoAutomationRunResult {
  /** ISO timestamp the orchestrator started. */
  started_at: string;
  /** ISO timestamp the orchestrator finished. */
  finished_at: string;
  /** Wall-clock duration. */
  duration_ms: number;
  /** Per-brand summaries in eligibility-query order. */
  brands: PromoAutomationBrandSummary[];
  /** Roll-up across all brands for at-a-glance ops visibility. */
  totals: {
    brands_scanned: number;
    promos_fetched: number;
    promos_skipped_dedupe: number;
    drafts_generated: number;
    errors: number;
  };
}

export interface PromoAutomationRunArgs {
  /** Optional: scope the run to a single brand id (verification path). */
  brand_id_filter?: string;
}
