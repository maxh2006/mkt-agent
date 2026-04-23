// Big Wins live BigQuery adapter — public types.
//
// Adapter contract (see adapter.ts):
//   fetchBigWinsForBrand(input) → Promise<BigWinAdapterResult>
//
// Two output layers on purpose:
//   - `rows[]`  — adapter-internal shape with joined user + game fields,
//                 useful for automation rule evaluation (e.g. custom-rule
//                 range checks the caller applies in-memory).
//   - `facts[]` — 1:1 with rows, pre-masked, matching the AI-consumption
//                 `BigWinFacts` shape from src/lib/ai/types.ts. Ready to
//                 hand to `normalizeBigWin()` in the AI pipeline.
//
// Missing-table handling: `status: "missing"` distinct from `status: "error"`.
// See docs/04-automations.md and src/lib/bq/shared-schema.ts.

import type { BigWinFacts } from "@/lib/ai/types";
import type { GameRoundStatus } from "@/lib/bq/shared-types";

export type BigWinAdapterStatus = "ok" | "missing" | "error";

export type BigWinAdapterErrorCode =
  | "INVALID_INPUT"
  | "BQ_ERROR";

export interface BigWinAdapterError {
  code: BigWinAdapterErrorCode;
  message: string;
}

/**
 * Inputs for `fetchBigWinsForBrand()`. Thresholds mirror the default
 * rule config in docs/04-automations.md — callers map their per-brand
 * `automation_rules.config_json.default_rule` into this shape.
 */
export interface BigWinAdapterInput {
  brand_id: string;
  /** Floor for `game_rounds.payout_amount`. Docs default: 500. */
  min_payout: number;
  /** Floor for `game_rounds.win_multiplier`. Docs default: 10. */
  min_multiplier: number;
  /** How the two thresholds combine. Docs default: "OR". */
  logic: "AND" | "OR";
  /** Lower bound on `settled_at` — ISO string. */
  since_iso: string;
  /** Row cap. Default 50 when unset. */
  limit?: number;
  /** Used in fact construction. Default "PHP" when unset. */
  currency?: string;
}

/**
 * Adapter-internal row — close to raw BQ shape with joined user + game
 * metadata. Automation-rule code iterates this layer; the AI pipeline
 * uses the pre-computed `facts[]` instead.
 */
export interface BigWinRow {
  user_id: string;
  brand_id: string;
  game_code: string;
  category: string | null;
  bet_amount: number;
  payout_amount: number;
  win_multiplier: number | null;
  status: GameRoundStatus;
  /** ISO string — unwrapped from BQ's {value} wrapper at the adapter edge. */
  bet_at: string;
  settled_at: string | null;
  /** Joined from `shared.users`. Pre-mask — NEVER surface unmasked. */
  username: string | null;
  /** Joined from `shared.games`. */
  game_name: string | null;
  /** Joined from `shared.games`. */
  game_vendor: string | null;
}

export interface BigWinAdapterResult {
  brand_id: string;
  fetched_at: string; // ISO
  /** Echoed inputs (post-default resolution) for ops visibility. */
  input_echo: Required<Omit<BigWinAdapterInput, "currency" | "limit">> & {
    currency: string;
    limit: number;
  };
  status: BigWinAdapterStatus;
  /** Empty when status != "ok". */
  rows: BigWinRow[];
  /** 1:1 with rows, pre-masked. Ready for `normalizeBigWin()`. */
  facts: BigWinFacts[];
  /** Populated only when status === "error". */
  error?: BigWinAdapterError;
}
