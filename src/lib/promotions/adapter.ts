import { fetchPromotionsRaw } from "./client";
import { loadPromoIntegration } from "./load-integration";
import { normalizePromoPayload } from "./normalize";
import type {
  PromoAdapterError,
  PromoAdapterErrorCode,
  PromoAdapterResult,
} from "./types";

/**
 * Orchestrates the Running Promotions fetch for a single brand:
 *   load brand integration config → fetch → normalize → build result.
 *
 * Never throws on expected conditions (missing config, network error,
 * non-2xx, malformed JSON, unknown envelope shape). All of those surface
 * through `result.error`. Unexpected exceptions bubble so the caller
 * (API route / CLI / future scheduler) can surface a 500.
 *
 * On success, `result.promos` is a `PromoFacts[]` ready to feed into
 * `normalizePromo()` from `src/lib/ai/source-normalizers/promo.ts`.
 */
export async function fetchPromotionsForBrand(
  brandId: string,
): Promise<PromoAdapterResult> {
  const fetched_at = new Date().toISOString();

  const config = await loadPromoIntegration(brandId);
  if (!config) {
    const error: PromoAdapterError = {
      code: "BRAND_NOT_CONFIGURED",
      message:
        "Brand is missing api_base_url or promo_list_endpoint in integration settings",
    };
    logFetch({
      brandId,
      endpoint: "",
      status: null,
      count: 0,
      skipped: 0,
      errorCode: error.code,
    });
    return {
      brand_id: brandId,
      endpoint_used: "",
      fetched_at,
      promos: [],
      skipped: [],
      error,
    };
  }

  const raw = await fetchPromotionsRaw(config);
  if (raw.kind === "network_error") {
    const error: PromoAdapterError = {
      code: "NETWORK_ERROR",
      message: raw.message,
    };
    logFetch({
      brandId,
      endpoint: raw.url,
      status: null,
      count: 0,
      skipped: 0,
      errorCode: error.code,
    });
    return {
      brand_id: brandId,
      endpoint_used: raw.url,
      fetched_at,
      promos: [],
      skipped: [],
      error,
    };
  }

  const { url, status, body } = raw;

  if (status < 200 || status >= 300) {
    const error: PromoAdapterError = {
      code: "HTTP_ERROR",
      message: `Upstream responded ${status}`,
    };
    logFetch({
      brandId,
      endpoint: url,
      status,
      count: 0,
      skipped: 0,
      errorCode: error.code,
    });
    return {
      brand_id: brandId,
      endpoint_used: url,
      fetched_at,
      promos: [],
      skipped: [],
      error,
    };
  }

  const parsed = normalizePromoPayload(body);

  if (parsed.kind === "parse_error") {
    const error: PromoAdapterError = {
      code: "PARSE_ERROR",
      message: parsed.message,
    };
    logFetch({
      brandId,
      endpoint: url,
      status,
      count: 0,
      skipped: 0,
      errorCode: error.code,
    });
    return {
      brand_id: brandId,
      endpoint_used: url,
      fetched_at,
      promos: [],
      skipped: [],
      error,
    };
  }

  if (parsed.kind === "schema_error") {
    const error: PromoAdapterError = {
      code: "SCHEMA_ERROR",
      message: parsed.message,
    };
    logFetch({
      brandId,
      endpoint: url,
      status,
      count: parsed.promos.length,
      skipped: parsed.skipped.length,
      errorCode: error.code,
    });
    return {
      brand_id: brandId,
      endpoint_used: url,
      fetched_at,
      promos: parsed.promos,
      skipped: parsed.skipped,
      error,
    };
  }

  logFetch({
    brandId,
    endpoint: url,
    status,
    count: parsed.promos.length,
    skipped: parsed.skipped.length,
    errorCode: null,
  });

  return {
    brand_id: brandId,
    endpoint_used: url,
    fetched_at,
    promos: parsed.promos,
    skipped: parsed.skipped,
  };
}

// ─── Observability ──────────────────────────────────────────────────────────

/**
 * One-line-per-fetch log for ops visibility. No secrets, no promo bodies
 * (operators inspect those via the preview route when needed).
 */
function logFetch(args: {
  brandId: string;
  endpoint: string;
  status: number | null;
  count: number;
  skipped: number;
  errorCode: PromoAdapterErrorCode | null;
}): void {
  const parts = [
    `brand=${args.brandId}`,
    `endpoint=${args.endpoint || "(none)"}`,
    `status=${args.status ?? "-"}`,
    `count=${args.count}`,
    `skipped=${args.skipped}`,
  ];
  if (args.errorCode) parts.push(`err=${args.errorCode}`);
  console.log(`[promotions] ${parts.join(" ")}`);
}
