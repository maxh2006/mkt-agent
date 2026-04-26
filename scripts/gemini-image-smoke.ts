/**
 * Live Gemini / Nano Banana 2 background-image smoke.
 *
 * Reads AI_IMAGE_PROVIDER + GEMINI_API_KEY + AI_IMAGE_MODEL from
 * `.env` (via dotenv), builds a synthetic BackgroundImageRequest
 * from the visual compiler, calls `generateBackgroundImage()`
 * directly, and asserts the result is a real `ok` with a data URI.
 * Writes the decoded PNG to /tmp/gemini-image-smoke.png for an
 * eyeball check.
 *
 * Run: `npm run gemini:smoke`
 *
 * COSTS REAL MONEY: this hits the Gemini API and bills the linked
 * Google Cloud project. Each run = one image. Use sparingly.
 */

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateBackgroundImage } from "@/lib/ai/image/client";
import { compileVisualPrompt } from "@/lib/ai/visual/compile";
import { DEFAULT_BRAND_VISUAL_DEFAULTS } from "@/lib/ai/visual/validation";
import type { Platform } from "@/generated/prisma/enums";

async function main() {
  const provider = (process.env.AI_IMAGE_PROVIDER ?? "stub").toLowerCase();
  if (provider !== "gemini") {
    console.error(
      `[gemini-smoke] AI_IMAGE_PROVIDER=${provider} — this smoke only runs against gemini. Set AI_IMAGE_PROVIDER=gemini in .env first.`,
    );
    process.exit(2);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      "[gemini-smoke] GEMINI_API_KEY is not set — adapter will fail loud. Add the key to .env (https://aistudio.google.com/apikey).",
    );
    process.exit(2);
  }

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
      source_row_key: "gemini-smoke-1",
    },
  });

  console.log(
    `[gemini-smoke] compiled prompt: layout=${visual.layout_key} format=${visual.platform_format} emphasis=${visual.visual_emphasis}`,
  );
  console.log(
    `[gemini-smoke] background_image_prompt (${visual.background_image_prompt.length} chars):`,
  );
  console.log(`  ${visual.background_image_prompt.slice(0, 200)}...`);

  const t0 = Date.now();
  const result = await generateBackgroundImage({
    background_image_prompt: visual.background_image_prompt,
    negative_prompt: visual.negative_prompt,
    platform_format: visual.platform_format,
    layout_key: visual.layout_key,
    safe_zone_config: visual.safe_zone_config,
    subject_focus: visual.subject_focus,
    visual_emphasis: visual.visual_emphasis,
    brand_palette: { primary: "#0F172A", secondary: "#475569", accent: "#F59E0B" },
    trace: {
      brand_id: "gemini-smoke",
      sample_group_id: "gemini-smoke-group",
      source_type: "big_win",
      platform: "instagram",
    },
  });
  const elapsedMs = Date.now() - t0;

  console.log(
    `[gemini-smoke] result: status=${result.status} provider=${result.provider} model=${result.model} duration=${elapsedMs}ms`,
  );

  if (result.status !== "ok") {
    console.error(
      `[gemini-smoke] FAILED: code=${result.error_code} message=${result.error_message}`,
    );
    process.exit(1);
  }

  if (!result.artifact_url || !result.artifact_url.startsWith("data:")) {
    console.error(
      `[gemini-smoke] FAILED: artifact_url is not a data URI (got: ${result.artifact_url?.slice(0, 60)}...)`,
    );
    process.exit(1);
  }

  // Decode and write to /tmp for eyeball verification.
  const commaIdx = result.artifact_url.indexOf(",");
  const b64 = result.artifact_url.slice(commaIdx + 1);
  const bytes = Buffer.from(b64, "base64");
  const out = path.join("/tmp", "gemini-image-smoke.png");
  await fs.writeFile(out, bytes);

  console.log(`[gemini-smoke] artifact: ${bytes.byteLength} bytes → ${out}`);
  console.log(`[gemini-smoke] OK — Gemini end-to-end verified`);
}

main().catch((err) => {
  console.error("[gemini-smoke] threw:", err);
  process.exit(1);
});
