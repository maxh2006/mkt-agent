// Hot Games live BigQuery adapter — public types.
//
// Adapter contract (see adapter.ts):
//   fetchHotGamesForBrand(input) → Promise<HotGamesAdapterResult>
//
// Unlike Big Wins (many rows per scan), Hot Games produces ONE frozen
// snapshot per call — the `facts` field is a single `HotGamesFacts` (or
// null on missing/error). The frozen-snapshot contract from
// docs/07-ai-boundaries.md is honored: the scan result IS the snapshot;
// refine cycles must reuse the facts baked into
// `Post.generation_context_json` at creation time, not re-scan.

import type { HotGamesFacts } from "@/lib/ai/types";

export type HotGamesAdapterStatus = "ok" | "missing" | "error";

export type HotGamesAdapterErrorCode =
  | "INVALID_INPUT"
  | "BQ_ERROR";

export interface HotGamesAdapterError {
  code: HotGamesAdapterErrorCode;
  message: string;
}

/**
 * Inputs for `fetchHotGamesForBrand()`. Shape mirrors the rule config in
 * docs/04-automations.md — callers map their per-brand
 * `automation_rules.config_json` into this shape.
 */
export interface HotGamesAdapterInput {
  brand_id: string;
  /** Rolling window for `bet_at`. Docs constrain to these 4 values. */
  source_window_minutes: 30 | 60 | 90 | 120;
  /** Ranked games to return (3..10 inclusive per docs). */
  hot_games_count: number;
  /** "HH:MM" per rank. Length MUST equal `hot_games_count`. */
  time_mapping: string[];
  /** Optional operator override for the human-readable range summary.
   *  When unset, the adapter derives it from `time_mapping`. */
  time_slot_summary?: string;
}

/**
 * Aggregated adapter-internal row — one per ranked game. Joined
 * `shared.games` metadata for display fields.
 */
export interface HotGameRow {
  game_code: string;
  game_name: string | null;
  game_display_name: string | null;
  game_vendor: string | null;
  rtp: number | null;
  game_icon: string | null;
  category: string | null;
  /** COUNT(*) — settled rounds in the window for this game. */
  round_count: number;
}

export interface HotGamesAdapterResult {
  brand_id: string;
  fetched_at: string; // ISO
  input_echo: HotGamesAdapterInput;
  status: HotGamesAdapterStatus;
  /** Empty when status != "ok". */
  rows: HotGameRow[];
  /** Single frozen snapshot. null when status != "ok". */
  facts: HotGamesFacts | null;
  /** Populated only when status === "error". */
  error?: HotGamesAdapterError;
}
