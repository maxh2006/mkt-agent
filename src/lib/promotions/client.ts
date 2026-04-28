import type { PromoIntegrationConfig } from "./types";

/**
 * Raw response from the upstream promotions API, pre-validation. The
 * adapter layer turns this into a typed `PromoAdapterResult`.
 */
export interface PromoFetchRawResult {
  kind: "ok";
  /** Fully resolved URL the fetch hit. */
  url: string;
  /** HTTP status code from the upstream response. */
  status: number;
  /** Raw response body as text. Adapter is responsible for JSON.parse. */
  body: string;
}

export interface PromoFetchNetworkError {
  kind: "network_error";
  url: string;
  message: string;
}

/**
 * Thin, stateless fetcher against the brand's own promo API.
 *
 * Mirrors the small-boundary shape used by `src/lib/manus/client.ts`:
 * does not interpret HTTP status, does not parse JSON, does not throw on
 * non-2xx. Callers get everything they need to decide.
 *
 * `new URL(endpoint, base)` handles both absolute
 * (`https://api.brand.com/v1/promos`) and relative (`/v1/promos`)
 * endpoint values naturally.
 */
export async function fetchPromotionsRaw(
  config: PromoIntegrationConfig,
): Promise<PromoFetchRawResult | PromoFetchNetworkError> {
  let url: string;
  try {
    url = new URL(config.promo_list_endpoint, config.api_base_url).toString();
  } catch (err) {
    return {
      kind: "network_error",
      url: `${config.api_base_url}${config.promo_list_endpoint}`,
      message:
        err instanceof Error
          ? `Invalid URL: ${err.message}`
          : "Invalid URL components",
    };
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        // Upstream may or may not key on this; sending it is harmless
        // when absent on their side.
        ...(config.external_brand_code
          ? { "X-Brand-Code": config.external_brand_code }
          : {}),
        // x-api-key auth — WildSpinz Promotions API requires this.
        // Header name hardcoded for now (one shape covers our current
        // brand). If a future brand uses a different scheme, promote
        // PromoIntegrationConfig.api_key to a structured object.
        ...(config.api_key ? { "x-api-key": config.api_key } : {}),
      },
    });
    const body = await res.text();
    return { kind: "ok", url, status: res.status, body };
  } catch (err) {
    return {
      kind: "network_error",
      url,
      message: err instanceof Error ? err.message : "fetch() threw",
    };
  }
}
