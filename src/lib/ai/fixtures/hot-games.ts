import type { HotGamesFacts } from "../types";

/**
 * Mock Hot Games snapshot. The `scan_timestamp` + `ranked_games` array
 * is the frozen content later refine calls must reuse — see
 * docs/07-ai-boundaries.md "Hot Games Frozen Snapshot".
 */
export function hotGamesFixture(overrides?: Partial<HotGamesFacts>): HotGamesFacts {
  return {
    kind: "hot_games",
    scan_timestamp: "2026-04-21T10:00:00+08:00",
    source_window_minutes: 120,
    time_slot_summary: "6pm–11pm tonight",
    ranked_games: [
      { rank: 1, game_name: "Fortune Gems",    vendor: "JILI",      rtp: 96.5, time_slot_iso: "2026-04-21T18:00:00+08:00" },
      { rank: 2, game_name: "Super Ace",       vendor: "JILI",      rtp: 96.0, time_slot_iso: "2026-04-21T19:00:00+08:00" },
      { rank: 3, game_name: "Golden Empire",   vendor: "Jili",      rtp: 95.8, time_slot_iso: "2026-04-21T20:00:00+08:00" },
      { rank: 4, game_name: "Money Coming",    vendor: "JILI",      rtp: 95.5, time_slot_iso: "2026-04-21T21:00:00+08:00" },
      { rank: 5, game_name: "Boxing King",     vendor: "JILI",      rtp: 95.2, time_slot_iso: "2026-04-21T22:00:00+08:00" },
    ],
    ...overrides,
  };
}
