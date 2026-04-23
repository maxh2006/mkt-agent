import type { HotGamesFacts } from "@/lib/ai/types";
import type { HotGameRow, HotGamesAdapterInput } from "./types";

/**
 * Raw aggregated row shape returned by the SQL. BQ returns integer
 * counts as plain `number`s (no timestamp wrapping on aggregates), so
 * this is structurally identical to `HotGameRow` — but we keep a
 * separate alias so the adapter edge can normalize numeric coercion
 * defensively if BQ starts returning `bigint`-style `Long`s later.
 */
export type HotGameRawRow = HotGameRow;

export function liftHotGame(raw: HotGameRawRow): HotGameRow {
  return {
    game_code: raw.game_code,
    game_name: raw.game_name,
    game_display_name: raw.game_display_name,
    game_vendor: raw.game_vendor,
    rtp: raw.rtp === null ? null : Number(raw.rtp),
    game_icon: raw.game_icon,
    category: raw.category,
    round_count: Number(raw.round_count),
  };
}

/**
 * Builds the frozen `HotGamesFacts` snapshot from ranked rows +
 * operator-supplied `time_mapping[]`. The scan timestamp IS the
 * snapshot identity — `normalizeHotGames()` downstream uses it as
 * `source_id`.
 *
 * If `rows.length < hot_games_count`, the snapshot only includes the
 * rows we actually got (caller-visible via the log + result shape).
 * We do NOT pad with placeholder games — that would misrepresent
 * source reality.
 */
export function toHotGamesFacts(
  rows: HotGameRow[],
  input: HotGamesAdapterInput,
): HotGamesFacts {
  const scan_timestamp = new Date().toISOString();
  const ranked_games = rows.map((r, i) => ({
    rank: i + 1,
    game_name: r.game_display_name ?? r.game_name ?? r.game_code,
    vendor: r.game_vendor,
    rtp: r.rtp,
    time_slot_iso: composeTodayIso(input.time_mapping[i] ?? ""),
  }));

  return {
    kind: "hot_games",
    scan_timestamp,
    source_window_minutes: input.source_window_minutes,
    ranked_games,
    time_slot_summary:
      input.time_slot_summary ?? buildWindowSummary(input.time_mapping),
  };
}

/**
 * Input validation. Returns null on success, or a short reason string
 * on failure. Kept as a separate export so the adapter + admin route
 * can surface the same diagnostics.
 */
export function validateHotGamesInput(
  input: HotGamesAdapterInput,
): string | null {
  if (![30, 60, 90, 120].includes(input.source_window_minutes)) {
    return `source_window_minutes must be one of 30|60|90|120 (got ${input.source_window_minutes})`;
  }
  if (
    !Number.isInteger(input.hot_games_count) ||
    input.hot_games_count < 3 ||
    input.hot_games_count > 10
  ) {
    return `hot_games_count must be an integer in 3..10 (got ${input.hot_games_count})`;
  }
  if (input.time_mapping.length !== input.hot_games_count) {
    return `time_mapping.length (${input.time_mapping.length}) must equal hot_games_count (${input.hot_games_count})`;
  }
  for (const slot of input.time_mapping) {
    if (!/^\d{1,2}:\d{2}$/.test(slot)) {
      return `time_mapping entries must be "HH:MM" (got "${slot}")`;
    }
  }
  // Strictly ascending — docs/04-automations.md rule.
  for (let i = 1; i < input.time_mapping.length; i++) {
    if (compareHHMM(input.time_mapping[i - 1], input.time_mapping[i]) >= 0) {
      return `time_mapping must be strictly ascending (at index ${i})`;
    }
  }
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function composeTodayIso(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return "";
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = m[1].padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${m[2]}:00.000Z`;
}

function compareHHMM(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}

/**
 * Human-readable window summary like "6pm–11pm tonight". Best-effort
 * formatting; falls back to the raw range if the mapping is malformed.
 */
function buildWindowSummary(mapping: string[]): string {
  if (mapping.length === 0) return "";
  const first = mapping[0];
  const last = mapping[mapping.length - 1];
  const firstFmt = to12hLabel(first);
  const lastFmt = to12hLabel(last);
  return `${firstFmt}–${lastFmt} tonight`;
}

function to12hLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const mm = m[2];
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  // Drop :00 for clean labels ("6pm" not "6:00pm"); keep non-zero mins.
  return mm === "00" ? `${h12}${suffix}` : `${h12}:${mm}${suffix}`;
}
