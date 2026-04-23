import { runQuery } from "@/lib/bq/client";
import { buildBigWinsQuery } from "./query";
import { lift, toBigWinFacts, type BigWinRawRow } from "./normalize";
import type {
  BigWinAdapterErrorCode,
  BigWinAdapterInput,
  BigWinAdapterResult,
  BigWinAdapterStatus,
} from "./types";

const DEFAULT_LIMIT = 50;
const DEFAULT_CURRENCY = "PHP";

/**
 * fetchBigWinsForBrand — orchestrator for the Big Wins BQ adapter.
 *
 * Flow:
 *   1. Resolve defaults (limit, currency)
 *   2. Build parameterized SQL via `buildBigWinsQuery()`
 *   3. `runQuery<BigWinRawRow>()` under the billing-locked client
 *   4. On throw, detect missing-table (/Not found: Table/i) → degrade to
 *      `status: "missing"` without populating `error`. Non-missing throws
 *      → `status: "error"` with `BQ_ERROR`.
 *   5. Lift raw rows (unwrap BQ timestamps), build `facts[]` via
 *      `toBigWinFacts()` applying `maskUsername()`.
 *
 * Never throws on expected conditions — callers branch on `status`.
 * Unexpected exceptions bubble.
 */
export async function fetchBigWinsForBrand(
  input: BigWinAdapterInput,
): Promise<BigWinAdapterResult> {
  const fetched_at = new Date().toISOString();
  const limit = input.limit ?? DEFAULT_LIMIT;
  const currency = input.currency ?? DEFAULT_CURRENCY;

  const input_echo = {
    brand_id: input.brand_id,
    min_payout: input.min_payout,
    min_multiplier: input.min_multiplier,
    logic: input.logic,
    since_iso: input.since_iso,
    currency,
    limit,
  };

  const { sql, params } = buildBigWinsQuery({
    brand_id: input.brand_id,
    min_payout: input.min_payout,
    min_multiplier: input.min_multiplier,
    logic: input.logic,
    since_iso: input.since_iso,
    limit,
  });

  let raw: BigWinRawRow[];
  try {
    raw = await runQuery<BigWinRawRow>(sql, { params });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isMissing = /Not found: Table/i.test(message);
    const status: BigWinAdapterStatus = isMissing ? "missing" : "error";
    logFetch({
      brandId: input.brand_id,
      status,
      rows: 0,
      facts: 0,
      errorCode: isMissing ? null : "BQ_ERROR",
    });
    return {
      brand_id: input.brand_id,
      fetched_at,
      input_echo,
      status,
      rows: [],
      facts: [],
      ...(isMissing
        ? {}
        : {
            error: { code: "BQ_ERROR" as const, message },
          }),
    };
  }

  const rows = raw.map(lift);
  const facts = rows.map((r) => toBigWinFacts(r, { currency }));

  logFetch({
    brandId: input.brand_id,
    status: "ok",
    rows: rows.length,
    facts: facts.length,
    errorCode: null,
  });

  return {
    brand_id: input.brand_id,
    fetched_at,
    input_echo,
    status: "ok",
    rows,
    facts,
  };
}

// ─── Observability ──────────────────────────────────────────────────────────

/**
 * One-line-per-fetch log for ops visibility. No secrets, no row content.
 * See plan's Observability section.
 */
function logFetch(args: {
  brandId: string;
  status: BigWinAdapterStatus;
  rows: number;
  facts: number;
  errorCode: BigWinAdapterErrorCode | null;
}): void {
  const parts = [
    `brand=${args.brandId}`,
    `status=${args.status}`,
    `rows=${args.rows}`,
    `facts=${args.facts}`,
  ];
  if (args.errorCode) parts.push(`err=${args.errorCode}`);
  if (args.status === "missing") {
    parts.push("(game_rounds not yet provisioned)");
  }
  console.log(`[big-wins] ${parts.join(" ")}`);
}
