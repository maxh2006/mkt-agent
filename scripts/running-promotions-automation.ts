/**
 * CLI wrapper for the Running Promotions automation orchestrator.
 *
 * Usage:
 *   npm run automation:running-promotions             # all eligible brands
 *   npm run automation:running-promotions -- <brand>  # single brand id
 *
 * Prints the structured PromoAutomationRunResult JSON. Exits 0 when the
 * run completes (even if individual brands had errors — that's normal
 * operational data). Exits 1 only when the orchestrator itself throws
 * (e.g. no admin user found to attribute drafts to).
 *
 * Useful for: one-shot ops verification before a Cloud Scheduler job is
 * wired in, or to re-run the flow ad-hoc when a brand's promo endpoint
 * recovers from an outage.
 */

import "dotenv/config";
import { runRunningPromotionsAutomation } from "@/lib/automations/running-promotions/orchestrator";

async function main() {
  const brand_id_filter = process.argv[2]?.trim() || undefined;

  if (brand_id_filter) {
    console.log(`[automation-cli] running for brand=${brand_id_filter}`);
  } else {
    console.log(`[automation-cli] running for all eligible brands`);
  }

  const result = await runRunningPromotionsAutomation({ brand_id_filter });

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `[automation-cli] OK brands=${result.totals.brands_scanned} fetched=${result.totals.promos_fetched} skipped_dedupe=${result.totals.promos_skipped_dedupe} generated=${result.totals.drafts_generated} errors=${result.totals.errors} duration_ms=${result.duration_ms}`,
  );
}

main().catch((err) => {
  console.error("[automation-cli] threw:", err);
  process.exit(1);
});
