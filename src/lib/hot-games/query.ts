import { SHARED_TABLES } from "@/lib/bq/shared-schema";

/**
 * Parameterized Hot Games aggregation SQL.
 *
 * Logic:
 *   - Window: `bet_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL N MINUTE)`
 *     (partition-friendly per docs/04-automations.md cost rules).
 *   - Scope: brand + `status = 'settled'`.
 *   - Join `shared.games` on `tg_game_code` for display metadata + RTP.
 *   - Group by game_code (+ the joined game columns, required by BQ
 *     standard SQL when not aggregated).
 *   - HAVING `g.rtp IS NOT NULL` — a game without an RTP can't be
 *     ranked by the static-RTP ordering the normalizer uses.
 *   - Ranking: static `g.rtp DESC`, tie-break on `round_count DESC`.
 *     Intentionally simple per the plan's "do not overengineer"
 *     constraint; observed-payout ranking is a follow-up once real
 *     data reveals whether it beats static RTP.
 *
 * Column list is explicit — no SELECT * (BQ cost rule).
 */
export function buildHotGamesQuery(input: {
  brand_id: string;
  source_window_minutes: number;
  hot_games_count: number;
}): { sql: string; params: Record<string, unknown> } {
  const sql = `
SELECT
  gr.game_code,
  g.name          AS game_name,
  g.display_name  AS game_display_name,
  g.vendor        AS game_vendor,
  g.rtp           AS rtp,
  g.game_icon     AS game_icon,
  g.category      AS category,
  COUNT(*)        AS round_count
FROM ${SHARED_TABLES.game_rounds} gr
LEFT JOIN ${SHARED_TABLES.games} g
  ON g.tg_game_code = gr.game_code
WHERE gr.brand_id = @brand_id
  AND gr.status   = 'settled'
  AND gr.bet_at   >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @window_minutes MINUTE)
GROUP BY gr.game_code, g.name, g.display_name, g.vendor, g.rtp, g.game_icon, g.category
HAVING g.rtp IS NOT NULL
ORDER BY g.rtp DESC, round_count DESC
LIMIT @hot_games_count
`.trim();

  return {
    sql,
    params: {
      brand_id: input.brand_id,
      window_minutes: input.source_window_minutes,
      hot_games_count: input.hot_games_count,
    },
  };
}
