/**
 * CLI wrapper for the Adhoc Event automation orchestrator.
 *
 * Usage:
 *   npm run automation:adhoc-events                              # all eligible events
 *   npm run automation:adhoc-events -- <brand_id>                # single brand
 *   npm run automation:adhoc-events -- --event=<event_id>        # single event
 *   npm run automation:adhoc-events -- --lookahead=48            # override window
 *
 * Prints the structured EventAutomationRunResult JSON. Exits 0 when the
 * run completes (even if individual events had errors — that's normal
 * operational data). Exits 1 only when the orchestrator itself throws
 * (e.g. no admin user found to attribute drafts to).
 *
 * Useful for: one-shot ops verification before a Cloud Scheduler job
 * is wired in, or to re-run the flow ad-hoc when a new event has
 * `auto_generate_posts` flipped on and the operator wants the drafts
 * to appear immediately rather than waiting for the next scheduled tick.
 */

import "dotenv/config";
import { runAdhocEventsAutomation } from "@/lib/automations/adhoc-events/orchestrator";

interface ParsedArgs {
  brand_id?: string;
  event_id?: string;
  lookahead_hours?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (const a of argv) {
    if (!a) continue;
    if (a.startsWith("--event=")) {
      out.event_id = a.slice("--event=".length).trim() || undefined;
      continue;
    }
    if (a.startsWith("--lookahead=")) {
      const n = parseInt(a.slice("--lookahead=".length), 10);
      if (Number.isFinite(n) && n > 0) out.lookahead_hours = n;
      continue;
    }
    if (a.startsWith("--")) continue; // ignore unknown flags
    if (!out.brand_id) out.brand_id = a.trim();
  }
  return out;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  const labelParts: string[] = [];
  if (parsed.brand_id) labelParts.push(`brand=${parsed.brand_id}`);
  if (parsed.event_id) labelParts.push(`event=${parsed.event_id}`);
  if (parsed.lookahead_hours) labelParts.push(`lookahead=${parsed.lookahead_hours}h`);
  const label = labelParts.length > 0 ? labelParts.join(" ") : "all eligible events";

  console.log(`[automation-cli] running for ${label}`);

  const result = await runAdhocEventsAutomation({
    brand_id_filter: parsed.brand_id,
    event_id_filter: parsed.event_id,
    lookahead_hours: parsed.lookahead_hours,
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `[automation-cli] OK events_scanned=${result.totals.events_scanned} events_eligible=${result.totals.events_eligible} slots=${result.totals.slots_processed} skipped_dedupe=${result.totals.skipped_dedupe} generated=${result.totals.drafts_generated} errors=${result.totals.errors} duration_ms=${result.duration_ms}`,
  );
}

main().catch((err) => {
  console.error("[automation-cli] threw:", err);
  process.exit(1);
});
