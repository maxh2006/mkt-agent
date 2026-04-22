// Row interfaces for the Newgen shared BigQuery dataset.
//
// These types are the compile-time contract adapter code uses (e.g.
// `runQuery<GameRoundRow>(...)`). They mirror the operator-facing
// cheat sheet in docs/bq-shared-schema.md, with the following caveats:
//
//   - The LIVE columns on each table include a few extras beyond the
//     cheat sheet (e.g. `users` has `phone_verified`, `email_verified`,
//     `scheduled_reval_at`). These aren't typed here because automation
//     scans + the AI layer don't need them. Add fields as adapters need
//     them; the fixture at `fixtures/bq-shared-schema.json` is the
//     source-of-truth for the full live shape.
//
//   - Timestamp columns come back wrapped from the SDK by default
//     (`{ value: string }` — `BigQueryTimestamp`). We alias that as
//     `BQTimestamp` below so adapter code can narrow + unwrap in one
//     place.
//
//   - `GameRoundRow` is declared AHEAD of the table being created by
//     the platform team. Treat it as provisional — verify field names
//     + nullability against the real schema once the table ships (run
//     `npm run bq:smoke` and diff the fixture). See the banner on
//     that interface.
//
// See `docs/bq-shared-schema.md` for the operator-facing cheat sheet.

/** BigQuery SDK returns timestamps wrapped this way by default. */
export interface BQTimestamp {
  value: string; // ISO 8601
}

/** Convenience — most adapter code just wants the ISO string. */
export function unwrapBQTimestamp(
  v: BQTimestamp | string | null | undefined,
): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return v.value ?? null;
}

// ─── `shared.brands` ──────────────────────────────────────────────────────────
//
// Newgen's view of each casino brand. Mirror record — our own Postgres
// `brands` table is the operational source-of-truth inside this app.
// Joined against every other table via `brand_id`.

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  country_code: string | null;
  currency_code: string | null;
}

// ─── `shared.users` ───────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  brand_id: string;
  level: string | null;
  tags: string[] | null;
  country_code: string | null;
  telco: string | null;
  channel: string | null;
  balance: number;
  total_deposit: number;
  total_withdrawal: number;
  deposit_count: number;
  withdrawal_count: number;
  is_active: boolean;
  last_login_at: BQTimestamp | null;
  created_at: BQTimestamp;
  updated_at: BQTimestamp;
}

// ─── `shared.transactions` ────────────────────────────────────────────────────
//
// Completed deposits + withdrawals only. Bets + wins live in
// `shared.game_rounds`, not here. No pending / refund rows.

export type TransactionType = "deposit" | "withdrawal";
export type TransactionStatus = "completed";

export interface TransactionRow {
  user_id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  balance_before: number;
  balance_after: number;
  created_at: BQTimestamp;
  finalized_at: BQTimestamp | null;
}

// ─── `shared.game_rounds` ─────────────────────────────────────────────────────
//
// ⚠ PROVISIONAL — table not yet created by the platform team as of
// 2026-04-22. This interface is declared so Big Wins + Hot Games
// adapter code can compile today; once the table lands, re-run
// `npm run bq:smoke` and reconcile field names + nullability against
// the live schema.

export type GameRoundStatus = "pending" | "settled" | "refunded" | "reclaimed";

export interface GameRoundRow {
  user_id: string;
  brand_id: string;
  game_code: string;
  category: string | null;
  bet_amount: number;
  payout_amount: number;
  ggr: number;
  valid_bet: number;
  /** Pre-computed integer multiplier (e.g. 250 for a 250x win). */
  win_multiplier: number | null;
  status: GameRoundStatus;
  bet_at: BQTimestamp;
  settled_at: BQTimestamp | null;
}

// ─── `shared.games` ───────────────────────────────────────────────────────────

export interface GameRow {
  id: string;
  vendor: string | null;
  tg_game_code: string;
  tg_game_provider: string | null;
  name: string;
  display_name: string | null;
  category: string | null;
  rtp: number | null;
  /** Public URL (CDN path). */
  game_icon: string | null;
  is_active: boolean;
}

// ─── Aggregated handle ────────────────────────────────────────────────────────
//
// Lookup from the `SharedTableName` literal union to its row interface.
// Adapter code can use this if it needs to parameterize the table name;
// most code should just use the specific interface directly
// (`runQuery<UserRow>(...)`).

export interface SharedRowTypeMap {
  brands: BrandRow;
  users: UserRow;
  transactions: TransactionRow;
  game_rounds: GameRoundRow;
  games: GameRow;
}
