import { runQuery } from "@/lib/bq/client";
import { buildHotGamesQuery } from "./query";
import {
  liftHotGame,
  toHotGamesFacts,
  validateHotGamesInput,
  type HotGameRawRow,
} from "./normalize";
import type {
  HotGamesAdapterErrorCode,
  HotGamesAdapterInput,
  HotGamesAdapterResult,
  HotGamesAdapterStatus,
} from "./types";

/**
 * fetchHotGamesForBrand — orchestrator for the Hot Games BQ adapter.
 *
 * Flow:
 *   1. Validate input (window, count range, time_mapping length + format,
 *      strictly-ascending mapping) → on failure, return status="error"
 *      with INVALID_INPUT immediately (no BQ call).
 *   2. Build aggregation SQL via `buildHotGamesQuery()`.
 *   3. `runQuery<HotGameRawRow>()` under the billing-locked client.
 *   4. On throw, detect missing-table → `status: "missing"`. Non-missing
 *      throws → `status: "error"` with BQ_ERROR.
 *   5. Lift raw rows, then build the SINGLE frozen-snapshot
 *      `HotGamesFacts` via `toHotGamesFacts()`. That snapshot becomes
 *      the drafts' `generation_context_json` once wired up (refine
 *      cycles reuse it — see docs/07-ai-boundaries.md Hot Games Frozen
 *      Snapshot).
 */
export async function fetchHotGamesForBrand(
  input: HotGamesAdapterInput,
): Promise<HotGamesAdapterResult> {
  const fetched_at = new Date().toISOString();
  const input_echo = input;

  // 1. Input validation — no BQ call on bad input.
  const inputError = validateHotGamesInput(input);
  if (inputError) {
    logFetch({
      brandId: input.brand_id,
      status: "error",
      rows: 0,
      window: input.source_window_minutes,
      errorCode: "INVALID_INPUT",
    });
    return {
      brand_id: input.brand_id,
      fetched_at,
      input_echo,
      status: "error",
      rows: [],
      facts: null,
      error: { code: "INVALID_INPUT", message: inputError },
    };
  }

  // 2 + 3. Build + run SQL.
  const { sql, params } = buildHotGamesQuery({
    brand_id: input.brand_id,
    source_window_minutes: input.source_window_minutes,
    hot_games_count: input.hot_games_count,
  });

  let raw: HotGameRawRow[];
  try {
    raw = await runQuery<HotGameRawRow>(sql, { params });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isMissing = /Not found: Table/i.test(message);
    const status: HotGamesAdapterStatus = isMissing ? "missing" : "error";
    logFetch({
      brandId: input.brand_id,
      status,
      rows: 0,
      window: input.source_window_minutes,
      errorCode: isMissing ? null : "BQ_ERROR",
    });
    return {
      brand_id: input.brand_id,
      fetched_at,
      input_echo,
      status,
      rows: [],
      facts: null,
      ...(isMissing
        ? {}
        : {
            error: { code: "BQ_ERROR" as const, message },
          }),
    };
  }

  // 4 + 5. Lift + build frozen snapshot.
  const rows = raw.map(liftHotGame);
  const facts = toHotGamesFacts(rows, input);

  logFetch({
    brandId: input.brand_id,
    status: "ok",
    rows: rows.length,
    window: input.source_window_minutes,
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

function logFetch(args: {
  brandId: string;
  status: HotGamesAdapterStatus;
  rows: number;
  window: number;
  errorCode: HotGamesAdapterErrorCode | null;
}): void {
  const parts = [
    `brand=${args.brandId}`,
    `status=${args.status}`,
    `rows=${args.rows}`,
    `window=${args.window}m`,
  ];
  if (args.errorCode) parts.push(`err=${args.errorCode}`);
  if (args.status === "missing") {
    parts.push("(game_rounds not yet provisioned)");
  }
  console.log(`[hot-games] ${parts.join(" ")}`);
}
