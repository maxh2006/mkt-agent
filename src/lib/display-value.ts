/**
 * display-value.ts — PRESENTATION UTILITIES ONLY
 *
 * These functions compute what a source number should look like in generated content
 * based on the operator's value display configuration.
 *
 * Rules:
 * - NEVER import this module in route handlers or any server-side DB write path.
 * - NEVER use the output of these functions to overwrite a source value in the database.
 * - Source values are written by backend qualification logic only.
 * - These functions exist solely to power the live preview UI in the Automations page.
 */

import type { ValueDisplayConfig } from "@/lib/validations/automation";

/**
 * Compute the display number from a source number and the current value display config.
 * Returns a number for further formatting — does not produce the final display string.
 */
export function computeDisplayValue(source: number, cfg: ValueDisplayConfig): number {
  switch (cfg.display_mode) {
    case "exact":
      return source;
    case "rounded":
      return Math.round(source / 100) * 100;
    case "threshold_headline":
      // Return the highest standard threshold the source meets
      for (const t of [10000, 5000, 1000, 500, 100]) {
        if (source >= t) return t;
      }
      return source;
    case "range_headline":
      // Return the lower bound of the matching range
      for (const t of [10000, 5000, 1000, 500, 100]) {
        if (source >= t) return t;
      }
      return source;
    case "adjusted": {
      let val = source;
      switch (cfg.adjustment_type) {
        case "round_down":
          val = Math.floor(source / 100) * 100;
          break;
        case "round_up":
          val = Math.ceil(source / 100) * 100;
          break;
        case "subtract":
          val = source - cfg.adjustment_value;
          break;
        case "multiply":
          val = source * cfg.adjustment_value;
          break;
      }
      return Math.max(0, val);
    }
    default:
      return source;
  }
}

/**
 * Format a display number as a human-readable string for the preview UI.
 * The mode determines the phrasing (e.g. "Over $1,000" for threshold_headline).
 */
export function formatDisplayValue(value: number, mode: string): string {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  switch (mode) {
    case "threshold_headline":
      return `Over ${fmt(value)}`;
    case "range_headline": {
      const next = [100, 500, 1000, 5000, 10000].find((t) => t > value) ?? value * 2;
      return `${fmt(value)}–${fmt(next)}`;
    }
    default:
      return fmt(value);
  }
}
