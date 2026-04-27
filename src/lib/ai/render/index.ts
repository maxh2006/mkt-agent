// Deterministic overlay renderer — public entry.
//
// Composites the AI background (when available) + Post text + brand
// logo into a single PNG, using the layout spec for text zones, safe
// zones, gradient overlay, and logo placement.
//
// One composite per generation run; the orchestrator replicates the
// result onto every sibling draft via the queue inserter (siblings
// share the same compiled visual prompt + Gemini background — only
// text differs, and we use the first sample's text for MVP).
//
// Failure isolation: every error path returns a `CompositedImageResult`
// with `status: "error"` and a structured `error_code`. The
// orchestrator wraps the call in try/catch as a belt-and-braces guard
// against unexpected throws (Resvg native binding errors, OOM, etc.)
// — text drafts always ship.
//
// Output is a `data:image/png;base64,…` URI in `artifact_url`. Same
// MVP storage decision as the Gemini adapter: hosted https URLs
// arrive with the GCS storage migration follow-up.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { resolveLayout } from "@/lib/ai/visual/layouts";
import type { PlatformFormat } from "@/lib/ai/visual/types";
import { composeOverlay } from "./compose";
import { decodeBackground } from "./decode-bg";
import { fetchLogoBytes } from "./fetch-logo";
import { loadFonts } from "./fonts";
import {
  RENDER_VERSION,
  buildRenderErrorResult,
  type CompositedImageResult,
  type RenderRequest,
} from "./types";

/** Canvas pixel dimensions per platform format. */
const CANVAS_DIMENSIONS: Record<
  PlatformFormat,
  { width: number; height: number }
> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1920, height: 1080 },
  story: { width: 1080, height: 1920 },
};

const FALLBACK_BG = "#1f2937"; // neutral dark slate; Tailwind gray-800

/**
 * Render the composited final image. Always returns a result —
 * structured errors flow through `status: "error"`.
 */
export async function renderFinalImage(
  request: RenderRequest,
): Promise<CompositedImageResult> {
  const startedAt = Date.now();
  const generatedAt = new Date(startedAt).toISOString();

  // 1. Resolve layout + canvas dimensions from the compiled visual prompt.
  const layout = resolveLayout(
    request.visual.effective_inputs.layout_family,
    request.visual.platform_format,
  );
  const canvas = CANVAS_DIMENSIONS[request.visual.platform_format];

  // 2. Decode the AI background (data URI). null means stub / failure
  //    / disabled — fall back to a brand-color solid background.
  let backgroundDataUri: string | null = null;
  let backgroundFallback = false;
  try {
    const decoded = decodeBackground(request.background_artifact_url);
    if (decoded) {
      backgroundDataUri = decoded.data_uri;
    } else {
      backgroundFallback = true;
    }
  } catch (err) {
    return buildRenderErrorResult({
      request,
      error_code: "BACKGROUND_DECODE_FAILED",
      error_message: err instanceof Error ? err.message : String(err),
      generated_at: generatedAt,
      duration_ms: Date.now() - startedAt,
    });
  }

  // 3. Try to fetch the brand logo for the layout's logo_slot variant.
  //    Failures are silent — composite renders without a logo.
  const logoUrl = pickLogoForLayout(layout.logo_slot?.variant ?? null, request);
  const logoBytes = await fetchLogoBytes(logoUrl);
  const logoDataUri = logoBytes?.data_uri ?? null;

  // 4. Load bundled fonts. This is a deploy-config error if it fails.
  let fonts;
  try {
    fonts = await loadFonts();
  } catch (err) {
    return buildRenderErrorResult({
      request,
      error_code: "FONT_LOAD_FAILED",
      error_message: err instanceof Error ? err.message : String(err),
      generated_at: generatedAt,
      duration_ms: Date.now() - startedAt,
    });
  }

  // 5. Build the JSX tree and run Satori → SVG.
  const brandColor = pickBrandColor(request);
  const tree = composeOverlay({
    layout,
    canvas,
    background_data_uri: backgroundDataUri,
    logo_data_uri: logoDataUri,
    brand_color: brandColor,
    text: request.text,
  });

  let svg: string;
  try {
    svg = await satori(tree, {
      width: canvas.width,
      height: canvas.height,
      fonts: fonts.map((f) => ({
        name: f.name,
        data: f.data,
        weight: f.weight,
        style: f.style,
      })),
    });
  } catch (err) {
    return buildRenderErrorResult({
      request,
      error_code: "SATORI_FAILED",
      error_message: truncate(err instanceof Error ? err.message : String(err), 500),
      generated_at: generatedAt,
      duration_ms: Date.now() - startedAt,
    });
  }

  // 6. Resvg → PNG bytes → data URI.
  let pngBytes: Buffer;
  try {
    const resvg = new Resvg(svg, {
      // Honor the canvas size we asked Satori to lay out at — Resvg
      // can otherwise pick its own size from the SVG's viewBox.
      fitTo: { mode: "width", value: canvas.width },
    });
    const rendered = resvg.render();
    pngBytes = Buffer.from(rendered.asPng());
  } catch (err) {
    return buildRenderErrorResult({
      request,
      error_code: "RESVG_FAILED",
      error_message: truncate(err instanceof Error ? err.message : String(err), 500),
      generated_at: generatedAt,
      duration_ms: Date.now() - startedAt,
    });
  }

  const dataUri = `data:image/png;base64,${pngBytes.toString("base64")}`;
  const durationMs = Date.now() - startedAt;

  console.log(
    `[ai-render] source=${request.trace.source_type} brand=${request.trace.brand_id} group=${request.trace.sample_group_id} format=${request.visual.platform_format} layout=${layout.key} bg=${backgroundDataUri ? "ai" : "fallback"} logo=${logoDataUri ? "yes" : "no"} bytes=~${pngBytes.byteLength} duration_ms=${durationMs}`,
  );

  return {
    status: "ok",
    artifact_url: dataUri,
    width: canvas.width,
    height: canvas.height,
    layout_key: layout.key,
    platform_format: request.visual.platform_format,
    visual_emphasis: request.visual.visual_emphasis,
    background_fallback: backgroundFallback,
    logo_drawn: logoDataUri !== null,
    error_code: null,
    error_message: null,
    generated_at: generatedAt,
    duration_ms: durationMs,
    render_version: RENDER_VERSION,
    // Memory-only field — orchestrator passes these bytes to the GCS
    // upload step, then queue-inserter strips before persisting
    // `composited_image` to generation_context_json. The persisted
    // representation is `artifact_url` (https URL post-upload, or a
    // `data:` URI fallback when storage is unconfigured).
    png_bytes: pngBytes,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

function pickLogoForLayout(
  variant: "main" | "square" | "horizontal" | "vertical" | null,
  request: RenderRequest,
): string | null {
  if (!variant) return null;
  return request.brand.logos[variant] ?? request.brand.logos.main ?? null;
}

function pickBrandColor(request: RenderRequest): string {
  // Prefer secondary (often a calmer mid-tone) for the fallback
  // background; fall back to primary; fall back to neutral slate.
  // This only matters when there's no AI background — Gemini-driven
  // composites cover the brand color.
  const order = [
    request.brand.secondary_color,
    request.brand.primary_color,
    request.brand.accent_color,
  ];
  for (const c of order) {
    if (c && /^#[0-9a-fA-F]{6}$/.test(c)) return c;
  }
  return FALLBACK_BG;
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

// Re-export for callers.
export { RENDER_VERSION };
export type { CompositedImageResult, RenderRequest };
