import { db } from "@/lib/db";
import type { PromoIntegrationConfig } from "./types";

/**
 * Pulls the per-brand promo integration fields from
 * `Brand.integration_settings_json`.
 *
 * Returns null when the brand row is missing/inactive OR when either of
 * the required fields (`api_base_url`, `promo_list_endpoint`) is absent
 * or blank — the adapter treats both cases the same way
 * (`BRAND_NOT_CONFIGURED`), so this helper normalizes them here.
 *
 * `external_brand_code` is optional; blank strings are flattened to null
 * so callers can safely do `if (config.external_brand_code)` without
 * also checking for the empty string.
 */
export async function loadPromoIntegration(
  brandId: string,
): Promise<PromoIntegrationConfig | null> {
  const b = await db.brand.findFirst({
    where: { id: brandId, active: true },
    select: { integration_settings_json: true },
  });
  if (!b) return null;

  const raw = (b.integration_settings_json ?? {}) as Record<string, unknown>;
  const api_base_url = trim(raw.api_base_url);
  const promo_list_endpoint = trim(raw.promo_list_endpoint);
  const external_brand_code = trim(raw.external_brand_code);

  if (!api_base_url || !promo_list_endpoint) return null;

  return {
    api_base_url,
    promo_list_endpoint,
    external_brand_code: external_brand_code || null,
  };
}

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
