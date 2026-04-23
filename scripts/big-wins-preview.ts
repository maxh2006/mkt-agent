/**
 * scripts/big-wins-preview.ts
 *
 * CLI wrapper around the Big Wins live BigQuery adapter.
 *
 *   npm run big-wins:preview -- <brand_id> [flags]
 *
 * Flags:
 *   --min-payout N       default 500 (matches docs/04-automations.md default_rule)
 *   --min-multiplier N   default 10
 *   --logic AND|OR       default OR
 *   --since ISO          default now - 24h
 *   --limit N            default 50
 *   --currency CCY       default PHP
 *   --self-check         run normalizer shape check vs. fixture (no BQ call)
 *
 * The adapter is already missing-table-tolerant; the `--self-check` mode
 * additionally exercises the normalize path in isolation — useful while
 * `shared.game_rounds` isn't live yet. The CLI also auto-runs the
 * self-check when the adapter returns status="missing", so either way
 * you get shape verification.
 *
 * Exits 0 on status=ok or status=missing, 1 on status=error.
 */

import { fetchBigWinsForBrand } from "../src/lib/big-wins/adapter";
import { toBigWinFacts, lift } from "../src/lib/big-wins/normalize";
import type { BigWinRawRow } from "../src/lib/big-wins/normalize";

interface CliArgs {
  brand_id: string;
  min_payout: number;
  min_multiplier: number;
  logic: "AND" | "OR";
  since_iso: string;
  limit: number;
  currency: string;
  self_check_only: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const brandId = argv[2]?.trim();
  if (!brandId || brandId.startsWith("--")) {
    console.error(
      "Usage: npm run big-wins:preview -- <brand_id> [--min-payout N] " +
        "[--min-multiplier N] [--logic AND|OR] [--since ISO] [--limit N] " +
        "[--currency CCY] [--self-check]",
    );
    process.exit(2);
  }
  const rest = argv.slice(3);

  const get = (flag: string): string | undefined => {
    const i = rest.indexOf(flag);
    if (i < 0) return undefined;
    return rest[i + 1];
  };

  return {
    brand_id: brandId,
    min_payout: Number(get("--min-payout") ?? 500),
    min_multiplier: Number(get("--min-multiplier") ?? 10),
    logic: (get("--logic") === "AND" ? "AND" : "OR"),
    since_iso:
      get("--since") ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    limit: Number(get("--limit") ?? 50),
    currency: get("--currency") ?? "PHP",
    self_check_only: rest.includes("--self-check"),
  };
}

function runSelfCheck(currency: string): { ok: boolean; message: string } {
  // Hand-rolled raw row mimicking what BQ would return, including
  // a timestamp wrapper + a joined username + game metadata.
  const raw: BigWinRawRow = {
    user_id: "u-self-check-001",
    brand_id: "brand-self-check",
    game_code: "JILI_FORTUNE_GEMS",
    category: "slot",
    bet_amount: 500,
    payout_amount: 125_000,
    win_multiplier: 250,
    status: "settled",
    bet_at: { value: "2026-04-20T14:31:00.000Z" },
    settled_at: { value: "2026-04-20T14:32:00.000Z" },
    username: "juancarlos88",
    game_name: "Fortune Gems",
    game_vendor: "JILI",
  };

  const row = lift(raw);
  const facts = toBigWinFacts(row, { currency });

  // Shape assertions against BigWinFacts (from src/lib/ai/types.ts).
  const checks: Array<[string, boolean]> = [
    ["kind === 'big_win'", facts.kind === "big_win"],
    ["display_username masked", facts.display_username === "ju********88"],
    ["win_amount is number", typeof facts.win_amount === "number"],
    ["currency echoed", facts.currency === currency],
    ["game_name from join", facts.game_name === "Fortune Gems"],
    ["game_vendor from join", facts.game_vendor === "JILI"],
    ["win_multiplier from row", facts.win_multiplier === 250],
    ["occurred_at is ISO string", typeof facts.occurred_at === "string"],
    ["source_row_key derived", facts.source_row_key.startsWith("bq-big-win-")],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length === 0) {
    return {
      ok: true,
      message: `✓ normalizer self-check passed (${checks.length} assertions)`,
    };
  }
  return {
    ok: false,
    message:
      `✗ normalizer self-check FAILED (${failed.length}/${checks.length}):\n` +
      failed.map(([name]) => `   - ${name}`).join("\n") +
      `\n\nProduced facts:\n${JSON.stringify(facts, null, 2)}`,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log("─".repeat(72));
  console.log(
    `Big Wins preview — brand=${args.brand_id} logic=${args.logic} ` +
      `min_payout=${args.min_payout} min_multiplier=${args.min_multiplier}`,
  );
  console.log("─".repeat(72));

  if (args.self_check_only) {
    const sc = runSelfCheck(args.currency);
    console.log("");
    console.log(sc.message);
    process.exit(sc.ok ? 0 : 1);
  }

  const result = await fetchBigWinsForBrand({
    brand_id: args.brand_id,
    min_payout: args.min_payout,
    min_multiplier: args.min_multiplier,
    logic: args.logic,
    since_iso: args.since_iso,
    limit: args.limit,
    currency: args.currency,
  });

  console.log("");
  console.log("Summary");
  console.log(`  status     : ${result.status}`);
  console.log(`  rows       : ${result.rows.length}`);
  console.log(`  facts      : ${result.facts.length}`);
  console.log(`  fetched_at : ${result.fetched_at}`);
  if (result.error) {
    console.log(`  error.code : ${result.error.code}`);
    console.log(`  error.msg  : ${result.error.message}`);
  }

  if (result.status === "missing") {
    console.log("");
    console.log("ℹ game_rounds not yet provisioned — running normalizer self-check");
    console.log("  (exercises the maskUsername + fact-construction path).");
    const sc = runSelfCheck(args.currency);
    console.log("");
    console.log(sc.message);
  }

  if (result.facts.length > 0) {
    console.log("");
    console.log("First fact (sample):");
    console.log(JSON.stringify(result.facts[0], null, 2));
  }

  console.log("");
  console.log("─".repeat(72));
  console.log("Full BigWinAdapterResult:");
  console.log(JSON.stringify(result, null, 2));
  console.log("─".repeat(72));

  // Exit: 0 on ok or missing (degradation is not a failure), 1 on error.
  process.exit(result.status === "error" ? 1 : 0);
}

main().catch((err) => {
  console.error("\n❌ big-wins-preview failed:");
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
