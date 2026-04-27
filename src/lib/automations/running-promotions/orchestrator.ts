// Running Promotions automation orchestrator (Phase 5 — 2026-04-27).
//
// Sole entry point: `runRunningPromotionsAutomation(args)`.
//
// Flow per invocation:
//   1. Discover eligible brands (active brand + active
//      running_promotion automation rule).
//   2. Resolve the automation creator user (first admin — see
//      `src/lib/automations/get-creator.ts` for the temporary-shortcut
//      caveat).
//   3. For each brand sequentially:
//      a. Load brand context.
//      b. Fetch live promos via the existing per-brand API adapter.
//      c. For each (promo × platform) slot, dedup against existing
//         queue rows and (when not a dupe) run the AI generation
//         pipeline.
//   4. Return a structured per-brand summary + roll-up totals.
//
// Fail-isolation contract (locked):
//   - One brand's failure NEVER blocks other brands.
//   - One promo's failure within a brand NEVER blocks other promos
//     within that brand.
//   - The only condition that prevents the orchestrator from
//     starting is a missing automation creator (no admin exists).
//
// What this module does NOT do (deliberately):
//   - cadence honoring (config.check_schedule is read by future
//     scheduler infra, not here)
//   - per-promo recurrence (config.promo_rules[] — same as above)
//   - auto-approval / delivery rows / publishing (drafts only)
//   - parallelism (predictable rate-limits today; revisit when
//     volume warrants)

import { db } from "@/lib/db";
import type { Platform } from "@/generated/prisma/enums";
import { fetchPromotionsForBrand } from "@/lib/promotions/adapter";
import { loadBrandContext } from "@/lib/ai/load-brand";
import { runGeneration, normalizers } from "@/lib/ai/generate";
import { getAutomationCreator } from "@/lib/automations/get-creator";
import type {
  PromoAutomationBrandSummary,
  PromoAutomationError,
  PromoAutomationRunArgs,
  PromoAutomationRunResult,
} from "./types";

/**
 * Default platform set when the running_promotion rule's config
 * doesn't specify one. **MVP-ONLY** — mirrors the Events
 * generate-drafts fallback. NOT a permanent product rule.
 *
 * Future enhancement: read from `Brand.channels` (active rows) or
 * add a `platforms[]` array to the running_promotion config_json.
 * The single-platform default keeps the MVP volume + rate-limit
 * picture predictable while we get the orchestration shape right.
 */
const MVP_DEFAULT_PLATFORMS: Platform[] = ["facebook"];

const ERROR_MESSAGE_MAX_LEN = 500;

export async function runRunningPromotionsAutomation(
  args: PromoAutomationRunArgs = {},
): Promise<PromoAutomationRunResult> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  // Resolve the creator first so a config error fails fast — no
  // partial run before realizing we can't attribute drafts.
  const creator = await getAutomationCreator();

  // Eligibility: active brands with at least one enabled
  // running_promotion automation rule. Optional brand_id_filter
  // narrows to a single brand for verification runs.
  const brands = await db.brand.findMany({
    where: {
      active: true,
      ...(args.brand_id_filter ? { id: args.brand_id_filter } : {}),
      automation_rules: {
        some: { rule_type: "running_promotion", enabled: true },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(
    `[automation:promo] start brands=${brands.length}${args.brand_id_filter ? ` filter=${args.brand_id_filter}` : ""} creator=${creator.id}`,
  );

  const summaries: PromoAutomationBrandSummary[] = [];

  for (const brand of brands) {
    const summary = await processBrand(brand, creator.id);
    summaries.push(summary);
  }

  const finishedAt = Date.now();
  const finishedAtIso = new Date(finishedAt).toISOString();

  const totals = summaries.reduce(
    (acc, s) => {
      acc.promos_fetched += s.fetched_count;
      acc.promos_skipped_dedupe += s.skipped_dedupe_count;
      acc.drafts_generated += s.generated_drafts_count;
      acc.errors += s.errors.length + (s.fetch_error_code ? 1 : 0);
      return acc;
    },
    {
      brands_scanned: summaries.length,
      promos_fetched: 0,
      promos_skipped_dedupe: 0,
      drafts_generated: 0,
      errors: 0,
    },
  );

  console.log(
    `[automation:promo] done brands=${totals.brands_scanned} fetched=${totals.promos_fetched} skipped_dedupe=${totals.promos_skipped_dedupe} generated=${totals.drafts_generated} errors=${totals.errors} duration_ms=${finishedAt - startedAt}`,
  );

  return {
    started_at: startedAtIso,
    finished_at: finishedAtIso,
    duration_ms: finishedAt - startedAt,
    brands: summaries,
    totals,
  };
}

// ─── Per-brand processing ───────────────────────────────────────────────────

async function processBrand(
  brand: { id: string; name: string },
  creator_id: string,
): Promise<PromoAutomationBrandSummary> {
  const summary: PromoAutomationBrandSummary = {
    brand_id: brand.id,
    brand_name: brand.name,
    eligible: true,
    fetched_count: 0,
    skipped_dedupe_count: 0,
    generated_drafts_count: 0,
    errors: [],
  };

  // Load brand context once. Failure here means the brand became
  // inactive between the eligibility query and now (or some other
  // load-side issue) — record + skip the brand.
  let brandContext;
  try {
    brandContext = await loadBrandContext(brand.id);
    if (!brandContext) {
      summary.errors.push({
        phase: "context_load",
        message: "loadBrandContext returned null (brand inactive or missing)",
      });
      return summary;
    }
  } catch (err) {
    summary.errors.push({
      phase: "context_load",
      message: truncate(err instanceof Error ? err.message : String(err)),
    });
    return summary;
  }

  // Fetch live promos. Adapter never throws on expected conditions —
  // adapter-level errors come back via `result.error`.
  const fetchResult = await fetchPromotionsForBrand(brand.id);
  summary.fetched_count = fetchResult.promos.length;

  if (fetchResult.error) {
    summary.fetch_error_code = fetchResult.error.code;
    // Some error codes (notably SCHEMA_ERROR) still ship a partial
    // promos[] — process whatever we got. Other codes (e.g.
    // BRAND_NOT_CONFIGURED) come with promos: [] so the loop below
    // is a no-op for them.
  }

  for (const facts of fetchResult.promos) {
    for (const platform of MVP_DEFAULT_PLATFORMS) {
      // Dedup: existence check on (brand_id, source_type, source_id,
      // platform). findFirst (not count) — cheaper, clearer intent.
      // Status-agnostic: we skip even if the existing draft is
      // rejected/failed (operators handle re-generation manually
      // for MVP — delete the prior row to force a new draft).
      let existing: { id: string } | null;
      try {
        existing = await db.post.findFirst({
          where: {
            brand_id: brand.id,
            source_type: "promo",
            source_id: facts.promo_id,
            platform,
          },
          select: { id: true },
        });
      } catch (err) {
        summary.errors.push({
          phase: "dedupe",
          promo_id: facts.promo_id,
          platform,
          message: truncate(err instanceof Error ? err.message : String(err)),
        });
        continue;
      }

      if (existing) {
        summary.skipped_dedupe_count += 1;
        continue;
      }

      // Generate. Per-promo failure isolation: catch into errors[],
      // continue with next (promo × platform).
      try {
        const input = normalizers.normalizePromo({
          brand: brandContext,
          facts,
          platform,
        });
        const result = await runGeneration({
          input,
          created_by: creator_id,
        });
        summary.generated_drafts_count += result.created_post_ids.length;
      } catch (err) {
        summary.errors.push({
          phase: "generate",
          promo_id: facts.promo_id,
          platform,
          message: truncate(err instanceof Error ? err.message : String(err)),
        });
      }
    }
  }

  console.log(
    `[automation:promo] brand=${brand.id} fetched=${summary.fetched_count} skipped_dedupe=${summary.skipped_dedupe_count} generated=${summary.generated_drafts_count} errors=${summary.errors.length}${summary.fetch_error_code ? ` fetch_error=${summary.fetch_error_code}` : ""}`,
  );

  return summary;
}

function truncate(s: string): string {
  if (!s) return "";
  return s.length <= ERROR_MESSAGE_MAX_LEN ? s : `${s.slice(0, ERROR_MESSAGE_MAX_LEN)}…`;
}
