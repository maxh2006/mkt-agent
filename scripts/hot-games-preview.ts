/**
 * scripts/hot-games-preview.ts
 *
 * CLI wrapper around the Hot Games live BigQuery adapter.
 *
 *   npm run hot-games:preview -- <brand_id> [flags]
 *
 * Flags:
 *   --window N         30|60|90|120   default 120
 *   --count N          3..10          default 6
 *   --mapping csv      default "18:00,19:00,20:00,21:00,22:00,23:00"
 *                      (must contain `count` strictly-ascending HH:MM entries)
 *   --summary TXT      optional operator override for time_slot_summary
 *   --self-check       run normalizer shape check vs. fixture (no BQ call)
 *
 * The adapter is missing-table-tolerant; CLI auto-runs self-check when
 * adapter returns status="missing", so shape verification always
 * happens even before `shared.game_rounds` lands.
 *
 * Exits 0 on status=ok or status=missing, 1 on status=error.
 */

import { fetchHotGamesForBrand } from "../src/lib/hot-games/adapter";
import { toHotGamesFacts, liftHotGame } from "../src/lib/hot-games/normalize";
import type { HotGameRawRow } from "../src/lib/hot-games/normalize";
import type { HotGamesAdapterInput } from "../src/lib/hot-games/types";

interface CliArgs {
  brand_id: string;
  source_window_minutes: 30 | 60 | 90 | 120;
  hot_games_count: number;
  time_mapping: string[];
  time_slot_summary?: string;
  self_check_only: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const brandId = argv[2]?.trim();
  if (!brandId || brandId.startsWith("--")) {
    console.error(
      "Usage: npm run hot-games:preview -- <brand_id> [--window 30|60|90|120] " +
        "[--count 3..10] [--mapping HH:MM,HH:MM,...] [--summary TEXT] [--self-check]",
    );
    process.exit(2);
  }
  const rest = argv.slice(3);

  const get = (flag: string): string | undefined => {
    const i = rest.indexOf(flag);
    if (i < 0) return undefined;
    return rest[i + 1];
  };

  const rawWindow = Number(get("--window") ?? 120);
  if (![30, 60, 90, 120].includes(rawWindow)) {
    console.error(`Invalid --window ${rawWindow}; must be 30|60|90|120`);
    process.exit(2);
  }
  const window = rawWindow as 30 | 60 | 90 | 120;

  const count = Number(get("--count") ?? 6);
  const mappingCsv =
    get("--mapping") ?? "18:00,19:00,20:00,21:00,22:00,23:00";
  const mapping = mappingCsv.split(",").map((s) => s.trim());

  return {
    brand_id: brandId,
    source_window_minutes: window,
    hot_games_count: count,
    time_mapping: mapping,
    time_slot_summary: get("--summary"),
    self_check_only: rest.includes("--self-check"),
  };
}

function runSelfCheck(input: HotGamesAdapterInput): {
  ok: boolean;
  message: string;
} {
  // Hand-rolled aggregated rows (5, to keep assertions compact).
  const raw: HotGameRawRow[] = [
    {
      game_code: "JILI_FORTUNE_GEMS",
      game_name: "Fortune Gems",
      game_display_name: null,
      game_vendor: "JILI",
      rtp: 96.5,
      game_icon: null,
      category: "slot",
      round_count: 412,
    },
    {
      game_code: "JILI_SUPER_ACE",
      game_name: "Super Ace",
      game_display_name: null,
      game_vendor: "JILI",
      rtp: 96.0,
      game_icon: null,
      category: "slot",
      round_count: 301,
    },
    {
      game_code: "JILI_GOLDEN_EMPIRE",
      game_name: "Golden Empire",
      game_display_name: "Golden Empire",
      game_vendor: "JILI",
      rtp: 95.8,
      game_icon: null,
      category: "slot",
      round_count: 244,
    },
    {
      game_code: "JILI_MONEY_COMING",
      game_name: "Money Coming",
      game_display_name: null,
      game_vendor: "JILI",
      rtp: 95.5,
      game_icon: null,
      category: "slot",
      round_count: 190,
    },
    {
      game_code: "JILI_BOXING_KING",
      game_name: "Boxing King",
      game_display_name: null,
      game_vendor: "JILI",
      rtp: 95.2,
      game_icon: null,
      category: "slot",
      round_count: 150,
    },
  ];

  // Truncate mapping to 5 to match our 5 test rows, preserving first 5.
  const trimmedInput: HotGamesAdapterInput = {
    ...input,
    hot_games_count: 5,
    time_mapping: input.time_mapping.slice(0, 5),
  };

  const rows = raw.map(liftHotGame);
  const facts = toHotGamesFacts(rows, trimmedInput);

  const checks: Array<[string, boolean]> = [
    ["kind === 'hot_games'", facts.kind === "hot_games"],
    ["scan_timestamp is ISO", typeof facts.scan_timestamp === "string"],
    [
      "source_window_minutes echoed",
      facts.source_window_minutes === trimmedInput.source_window_minutes,
    ],
    ["ranked_games.length === 5", facts.ranked_games.length === 5],
    [
      "rank 1 has rtp 96.5",
      facts.ranked_games[0]?.rtp === 96.5 &&
        facts.ranked_games[0]?.rank === 1,
    ],
    [
      "rank 3 picks display_name",
      facts.ranked_games[2]?.game_name === "Golden Empire",
    ],
    ["vendor from row", facts.ranked_games[0]?.vendor === "JILI"],
    [
      "time_slot_iso is ISO",
      typeof facts.ranked_games[0]?.time_slot_iso === "string" &&
        facts.ranked_games[0].time_slot_iso.length > 0,
    ],
    [
      "time_slot_summary built",
      typeof facts.time_slot_summary === "string" &&
        facts.time_slot_summary.length > 0,
    ],
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
    `Hot Games preview — brand=${args.brand_id} window=${args.source_window_minutes}m ` +
      `count=${args.hot_games_count} mapping=[${args.time_mapping.join(",")}]`,
  );
  console.log("─".repeat(72));

  if (args.self_check_only) {
    const sc = runSelfCheck({
      brand_id: args.brand_id,
      source_window_minutes: args.source_window_minutes,
      hot_games_count: args.hot_games_count,
      time_mapping: args.time_mapping,
      time_slot_summary: args.time_slot_summary,
    });
    console.log("");
    console.log(sc.message);
    process.exit(sc.ok ? 0 : 1);
  }

  const result = await fetchHotGamesForBrand({
    brand_id: args.brand_id,
    source_window_minutes: args.source_window_minutes,
    hot_games_count: args.hot_games_count,
    time_mapping: args.time_mapping,
    time_slot_summary: args.time_slot_summary,
  });

  console.log("");
  console.log("Summary");
  console.log(`  status     : ${result.status}`);
  console.log(`  rows       : ${result.rows.length}`);
  console.log(`  facts      : ${result.facts ? "built" : "null"}`);
  console.log(`  fetched_at : ${result.fetched_at}`);
  if (result.error) {
    console.log(`  error.code : ${result.error.code}`);
    console.log(`  error.msg  : ${result.error.message}`);
  }

  if (result.status === "missing") {
    console.log("");
    console.log(
      "ℹ game_rounds not yet provisioned — running normalizer self-check",
    );
    console.log("  (exercises the time_slot + summary build path).");
    const sc = runSelfCheck({
      brand_id: args.brand_id,
      source_window_minutes: args.source_window_minutes,
      hot_games_count: args.hot_games_count,
      time_mapping: args.time_mapping,
      time_slot_summary: args.time_slot_summary,
    });
    console.log("");
    console.log(sc.message);
  }

  if (result.facts) {
    console.log("");
    console.log("Snapshot facts:");
    console.log(JSON.stringify(result.facts, null, 2));
  }

  console.log("");
  console.log("─".repeat(72));
  console.log("Full HotGamesAdapterResult:");
  console.log(JSON.stringify(result, null, 2));
  console.log("─".repeat(72));

  process.exit(result.status === "error" ? 1 : 0);
}

main().catch((err) => {
  console.error("\n❌ hot-games-preview failed:");
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
