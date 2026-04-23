import type { BigWinFacts } from "@/lib/ai/types";
import { maskUsername } from "@/lib/username-mask";
import type { BQTimestamp, GameRoundStatus } from "@/lib/bq/shared-types";
import { unwrapBQTimestamp } from "@/lib/bq/shared-types";
import type { BigWinRow } from "./types";

/**
 * Raw row shape returned by the SQL — before BQ timestamp unwrapping.
 * The adapter passes runQuery<BigWinRawRow> and this module lifts it
 * into the typed BigWinRow (with ISO-string timestamps) that callers see.
 */
export interface BigWinRawRow {
  user_id: string;
  brand_id: string;
  game_code: string;
  category: string | null;
  bet_amount: number;
  payout_amount: number;
  win_multiplier: number | null;
  status: GameRoundStatus;
  bet_at: BQTimestamp | string;
  settled_at: BQTimestamp | string | null;
  username: string | null;
  game_name: string | null;
  game_vendor: string | null;
}

export function lift(raw: BigWinRawRow): BigWinRow {
  return {
    user_id: raw.user_id,
    brand_id: raw.brand_id,
    game_code: raw.game_code,
    category: raw.category,
    bet_amount: Number(raw.bet_amount),
    payout_amount: Number(raw.payout_amount),
    win_multiplier:
      raw.win_multiplier === null ? null : Number(raw.win_multiplier),
    status: raw.status,
    // `!` here is safe because `bet_at` is non-nullable in GameRoundRow;
    // the fallback only guards BQ's timestamp wrapper.
    bet_at: unwrapBQTimestamp(raw.bet_at) ?? new Date(0).toISOString(),
    settled_at: unwrapBQTimestamp(raw.settled_at),
    username: raw.username,
    game_name: raw.game_name,
    game_vendor: raw.game_vendor,
  };
}

/**
 * Pure mapper: adapter-internal row → AI-consumption `BigWinFacts`.
 *
 * Applies `maskUsername()` to the raw username. Falls back to "[anon]"
 * when username is null (join miss — shouldn't happen once platform
 * confirms `users.brand_id` scope is correct, but safe default).
 *
 * `source_row_key` is a derived dedupe key (user_id + timestamp +
 * payout). Platform hasn't confirmed whether a `win_id` column exists
 * on `game_rounds`; once confirmed we prefer that (follow-up in plan).
 */
export function toBigWinFacts(
  row: BigWinRow,
  opts: { currency: string },
): BigWinFacts {
  const occurred = row.settled_at ?? row.bet_at;
  return {
    kind: "big_win",
    display_username: row.username ? maskUsername(row.username) : "[anon]",
    win_amount: row.payout_amount,
    currency: opts.currency,
    game_name: row.game_name ?? row.game_code,
    game_vendor: row.game_vendor,
    win_multiplier: row.win_multiplier,
    occurred_at: occurred,
    source_row_key: buildSourceRowKey(row),
  };
}

export function buildSourceRowKey(row: BigWinRow): string {
  const ts = row.settled_at ?? row.bet_at;
  return `bq-big-win-${row.user_id}-${ts}-${row.payout_amount}`;
}
