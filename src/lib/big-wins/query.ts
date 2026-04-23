import { SHARED_TABLES } from "@/lib/bq/shared-schema";
import type { BigWinAdapterInput } from "./types";

/**
 * Parameterized Big Wins SQL builder.
 *
 * Joins `game_rounds` to `users` (for username, brand-scoped) and `games`
 * (for name + vendor). WHERE clause enforces:
 *   - brand scope
 *   - `status = 'settled'`
 *   - `settled_at >= since_iso` (partition-friendly per docs/04-automations.md)
 *   - payout/multiplier thresholds combined by `logic` ("AND" or "OR")
 *
 * Column list is explicit — no SELECT * (matches the BQ cost rules).
 * Table refs always come through `SHARED_TABLES.*` so the
 * `assertQueriesAreQualified()` guardrail in `src/lib/bq/client.ts` is
 * satisfied without a special case.
 *
 * The OR vs AND branch happens at SQL-build time so the parameter list
 * stays clean (no awkward `CASE @logic WHEN ...` inside SQL). Same
 * parameter shape is used in both branches.
 */
export function buildBigWinsQuery(input: {
  brand_id: string;
  min_payout: number;
  min_multiplier: number;
  logic: "AND" | "OR";
  since_iso: string;
  limit: number;
}): { sql: string; params: Record<string, unknown> } {
  const combinator = input.logic === "AND" ? "AND" : "OR";

  const sql = `
SELECT
  gr.user_id,
  gr.brand_id,
  gr.game_code,
  gr.category,
  gr.bet_amount,
  gr.payout_amount,
  gr.win_multiplier,
  gr.status,
  gr.bet_at,
  gr.settled_at,
  u.username      AS username,
  g.name          AS game_name,
  g.vendor        AS game_vendor
FROM ${SHARED_TABLES.game_rounds} gr
LEFT JOIN ${SHARED_TABLES.users} u
  ON u.id = gr.user_id AND u.brand_id = gr.brand_id
LEFT JOIN ${SHARED_TABLES.games} g
  ON g.tg_game_code = gr.game_code
WHERE gr.brand_id = @brand_id
  AND gr.status   = 'settled'
  AND gr.settled_at >= TIMESTAMP(@since_iso)
  AND (gr.payout_amount >= @min_payout ${combinator} gr.win_multiplier >= @min_multiplier)
ORDER BY gr.settled_at DESC
LIMIT @limit
`.trim();

  return {
    sql,
    params: {
      brand_id: input.brand_id,
      since_iso: input.since_iso,
      min_payout: input.min_payout,
      min_multiplier: input.min_multiplier,
      limit: input.limit,
    },
  };
}
