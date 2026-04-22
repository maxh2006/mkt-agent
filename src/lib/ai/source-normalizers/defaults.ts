import type { NormalizedGenerationInput } from "../types";

/**
 * Canonical sample counts per source_type (see docs/07-ai-boundaries.md
 * "Multi-sample Draft Grouping"). Callers may override with an explicit
 * `sample_count`, but unspecified runs fall back to these.
 */
export function defaultSampleCount(
  sourceType: NormalizedGenerationInput["source_type"],
): number {
  switch (sourceType) {
    case "big_win":
      return 3;
    case "promo":
      return 3;
    case "hot_games":
      return 2;
    case "event":
      return 1;
    case "educational":
      return 2;
  }
}
