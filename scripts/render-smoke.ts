/**
 * Smoke test for the deterministic overlay renderer.
 *
 * Builds a synthetic RenderRequest from a hand-rolled fixture
 * (compiled visual prompt + sample text + brand stub) and runs the
 * full Satori → Resvg pipeline. Writes the resulting PNG to
 * /tmp/render-smoke.png so a human can eyeball it. Exits 0 on
 * success.
 *
 * Run: `npm run render:smoke`
 *
 * No DB / network deps (logo fetch URL is empty so the renderer
 * cleanly skips that branch).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { renderFinalImage } from "@/lib/ai/render";
import { compileVisualPrompt } from "@/lib/ai/visual/compile";
import { DEFAULT_BRAND_VISUAL_DEFAULTS } from "@/lib/ai/visual/validation";
import type { Platform } from "@/generated/prisma/enums";

async function main() {
  // Fixture compiled visual prompt — same shape `runGeneration()`
  // would attach. Use the brand default visual_defaults; no event
  // override; a synthetic big_win source fact for a concrete
  // subject_focus.
  const visual = compileVisualPrompt({
    brand: {
      ...DEFAULT_BRAND_VISUAL_DEFAULTS,
      visual_emphasis: "winner-forward",
      layout_family: "center_focus",
    },
    event: null,
    platform: "instagram" as Platform,
    source_facts: {
      kind: "big_win",
      display_username: "lucky***player",
      win_amount: 42_750,
      currency: "PHP",
      game_name: "Sweet Bonanza",
      game_vendor: "Pragmatic Play",
      win_multiplier: 1250,
      occurred_at: new Date().toISOString(),
      source_row_key: "smoke-test-1",
    },
  });

  console.log(
    `[smoke] compiled visual: layout=${visual.layout_key} emphasis=${visual.visual_emphasis} format=${visual.platform_format} subject="${visual.subject_focus.slice(0, 80)}"`,
  );

  const result = await renderFinalImage({
    // Pass null background to exercise the brand-color fallback path.
    // (When testing the Gemini path, paste a `data:image/png;base64,...`
    // URI here.)
    background_artifact_url: null,
    visual,
    text: {
      headline: "Lucky*** wins PHP 42,750",
      caption:
        "Massive 1,250x multiplier on Sweet Bonanza! Could you be next?",
      cta: "Play now",
      banner: "PHP 42,750 WIN",
    },
    brand: {
      name: "WildSpinz",
      primary_color: "#0F172A",
      secondary_color: "#475569",
      accent_color: "#F59E0B",
      logos: { main: null, square: null, horizontal: null, vertical: null },
    },
    trace: {
      brand_id: "smoke-brand",
      sample_group_id: "smoke-group",
      source_type: "big_win",
      platform: "instagram",
    },
  });

  console.log(
    `[smoke] result: status=${result.status} layout=${result.layout_key} format=${result.platform_format} bg_fallback=${result.background_fallback} logo=${result.logo_drawn} bytes=${result.artifact_url ? "data-uri" : "null"} duration=${result.duration_ms}ms`,
  );

  if (result.status !== "ok" || !result.artifact_url) {
    console.error(
      `[smoke] FAILED: status=${result.status} code=${result.error_code} message=${result.error_message}`,
    );
    process.exit(1);
  }

  // Decode the data URI and write PNG bytes to /tmp for eyeball check.
  const commaIdx = result.artifact_url.indexOf(",");
  const b64 = result.artifact_url.slice(commaIdx + 1);
  const bytes = Buffer.from(b64, "base64");
  const out = path.join("/tmp", "render-smoke.png");
  await fs.writeFile(out, bytes);

  console.log(
    `[smoke] wrote ${bytes.byteLength} bytes to ${out} (${result.width}x${result.height})`,
  );
  console.log(`[smoke] OK`);
}

main().catch((err) => {
  console.error("[smoke] threw:", err);
  process.exit(1);
});
