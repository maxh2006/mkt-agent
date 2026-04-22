import type { BigWinFacts } from "../types";

/**
 * Mock Big Win fact. Shaped like what the future BigQuery adapter will
 * emit after it applies brand-scoped username masking + amount/game lookup.
 */
export function bigWinFixture(overrides?: Partial<BigWinFacts>): BigWinFacts {
  return {
    kind: "big_win",
    display_username: "j***a88",
    win_amount: 125_000,
    currency: "PHP",
    game_name: "Fortune Gems",
    game_vendor: "JILI",
    win_multiplier: 250,
    occurred_at: "2026-04-20T14:32:00.000Z",
    source_row_key: "bq-big-win-2026-04-20-a9f2",
    ...overrides,
  };
}
