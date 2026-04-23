// Running Promotions live API adapter — public types.
//
// Adapter contract (see adapter.ts):
//   fetchPromotionsForBrand(brandId) →
//     Promise<PromoAdapterResult>
//
// `error` and `promos` are NOT mutually exclusive. A SCHEMA_ERROR may still
// ship a subset of well-formed promos alongside the error so the caller can
// choose partial-ingest recovery over total failure.

import type { PromoFacts } from "@/lib/ai/types";

export type PromoAdapterErrorCode =
  | "BRAND_NOT_CONFIGURED"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "PARSE_ERROR"
  | "SCHEMA_ERROR";

export interface PromoAdapterError {
  code: PromoAdapterErrorCode;
  message: string;
}

export interface PromoAdapterSkippedRow {
  reason: string;
  raw: unknown;
}

export interface PromoAdapterResult {
  brand_id: string;
  /** Full URL the adapter actually fetched (for ops visibility). Empty
   *  string when BRAND_NOT_CONFIGURED — no URL was ever constructed. */
  endpoint_used: string;
  fetched_at: string; // ISO
  /** Well-formed promos, ready to feed into
   *  `normalizePromo()` in `src/lib/ai/source-normalizers/promo.ts`. */
  promos: PromoFacts[];
  /** Rows that failed per-row validation. Batch survives; caller can
   *  log/inspect to diagnose upstream schema drift. */
  skipped: PromoAdapterSkippedRow[];
  /** Populated on any non-success condition. Partial data may still be
   *  present in `promos` when `code === "SCHEMA_ERROR"`. */
  error?: PromoAdapterError;
}

/** Brand integration config needed to call the promo endpoint. */
export interface PromoIntegrationConfig {
  api_base_url: string;
  promo_list_endpoint: string;
  external_brand_code: string | null;
}
