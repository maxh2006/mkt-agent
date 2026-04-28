/**
 * scripts/promotions-preview.ts
 *
 * CLI wrapper around the Running Promotions live adapter. Usage:
 *
 *   npm run promotions:preview -- <brand_id>
 *
 * Prints a human-readable summary of the fetch (brand, endpoint, status,
 * count, skipped, error) plus a JSON dump of the full `PromoAdapterResult`
 * on stdout. Useful for exercising the adapter against a real upstream
 * without bringing up the web app.
 *
 * This script bypasses the `ALLOW_ADMIN_PROMO_PREVIEW` env flag — that
 * flag exists to gate the HTTP route, not the adapter itself. CLI
 * invocation already requires database credentials, so the gate is the
 * operator's shell.
 */

import "dotenv/config";
import { fetchPromotionsForBrand } from "../src/lib/promotions/adapter";

async function main(): Promise<void> {
  const brandId = process.argv[2]?.trim();
  if (!brandId) {
    console.error(
      "Usage: npm run promotions:preview -- <brand_id>\n" +
        "  brand_id: the Brand.id (cuid) to fetch promos for",
    );
    process.exit(2);
  }

  console.log("─".repeat(72));
  console.log(`Promotions preview — brand=${brandId}`);
  console.log("─".repeat(72));

  const result = await fetchPromotionsForBrand(brandId);

  console.log("");
  console.log("Summary");
  console.log(`  brand_id      : ${result.brand_id}`);
  console.log(`  endpoint_used : ${result.endpoint_used || "(none)"}`);
  console.log(`  fetched_at    : ${result.fetched_at}`);
  console.log(`  promos        : ${result.promos.length}`);
  console.log(`  skipped       : ${result.skipped.length}`);
  if (result.error) {
    console.log(`  error.code    : ${result.error.code}`);
    console.log(`  error.message : ${result.error.message}`);
  }

  if (result.promos.length > 0) {
    console.log("");
    console.log("First promo (sanitized for readability):");
    const first = result.promos[0];
    console.log(`  promo_id      : ${first.promo_id}`);
    console.log(`  promo_title   : ${first.promo_title}`);
    console.log(`  reward        : ${first.reward}`);
    console.log(`  period_start  : ${first.period_start ?? "-"}`);
    console.log(`  period_end    : ${first.period_end ?? "-"}`);
  }

  if (result.skipped.length > 0) {
    console.log("");
    console.log("Skipped rows (first 5):");
    for (const s of result.skipped.slice(0, 5)) {
      console.log(`  - reason: ${s.reason}`);
    }
    if (result.skipped.length > 5) {
      console.log(`  … +${result.skipped.length - 5} more`);
    }
  }

  console.log("");
  console.log("─".repeat(72));
  console.log("Full PromoAdapterResult (JSON):");
  console.log(JSON.stringify(result, null, 2));
  console.log("─".repeat(72));

  // Exit code semantics so CI / callers can detect config/upstream issues:
  //   0 = ok (even with skipped rows)
  //   1 = error field populated (network/http/parse/schema/misconfig)
  process.exit(result.error ? 1 : 0);
}

main().catch((err) => {
  console.error("\n❌ promotions-preview failed:");
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
