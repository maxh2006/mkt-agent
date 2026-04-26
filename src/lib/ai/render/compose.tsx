// Satori JSX template for the overlay composite.
//
// Build a single absolutely-positioned canvas where:
//   - the AI background fills the whole frame (or a solid brand-color
//     fallback when no AI artifact is available)
//   - the layout's gradient_overlay (when present) is rendered as a
//     CSS gradient div for legibility behind text
//   - each non-empty text slot from the layout's `text_zones` is
//     rendered at its percentage rectangle
//   - the brand logo is drawn at `logo_slot` when bytes are available
//
// All coordinates come from the layout spec at
// `src/lib/ai/visual/layouts.ts` — the renderer never invents zones.
//
// IMPORTANT: this file is `.tsx` because Satori consumes JSX directly.
// It does NOT render in the browser; the JSX is fed to Satori's pure
// JS engine which produces an SVG string. No React. No DOM.

import type {
  Align,
  GradientOverlay,
  LayoutTemplate,
  TextZone,
} from "@/lib/ai/visual/types";
import type { RenderRequest } from "./types";

interface ComposeArgs {
  layout: LayoutTemplate;
  /** Canvas dimensions in pixels (already resolved per platform_format). */
  canvas: { width: number; height: number };
  /** Background source — null means brand-color solid fallback. */
  background_data_uri: string | null;
  /** Logo source — null means skip the logo. */
  logo_data_uri: string | null;
  brand_color: string;
  text: RenderRequest["text"];
}

/**
 * Returns the JSX tree the orchestrator passes to `satori()`. Pure
 * function; no I/O, no Promises.
 */
export function composeOverlay(args: ComposeArgs): React.ReactElement {
  const { layout, canvas, background_data_uri, logo_data_uri, brand_color, text } = args;

  return (
    <div
      style={{
        position: "relative",
        width: canvas.width,
        height: canvas.height,
        display: "flex",
        // Tiny safety margin: Satori's flex defaults align children
        // top-left when display:flex is set. Absolute children below
        // ignore this; explicit declaration prevents Satori warnings.
        flexDirection: "column",
        backgroundColor: brand_color,
      }}
    >
      {/* Background layer */}
      {background_data_uri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={background_data_uri}
          alt=""
          width={canvas.width}
          height={canvas.height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: canvas.width,
            height: canvas.height,
            objectFit: "cover",
          }}
        />
      ) : (
        // Solid brand-color rectangle (already on the parent
        // backgroundColor). Adding an explicit layer keeps the layer
        // ordering predictable for the gradient overlay below.
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: canvas.width,
            height: canvas.height,
            backgroundColor: brand_color,
            display: "flex",
          }}
        />
      )}

      {/* Optional gradient overlay for legibility behind text. */}
      {layout.gradient_overlay && (
        <div
          style={gradientStyle(layout.gradient_overlay, canvas)}
        />
      )}

      {/* Text zones */}
      {layout.text_zones.map((zone) => renderTextZone({ zone, canvas, text, logo_data_uri }))}
    </div>
  );
}

// ─── Internals ──────────────────────────────────────────────────────────────

function renderTextZone(args: {
  zone: TextZone;
  canvas: { width: number; height: number };
  text: RenderRequest["text"];
  logo_data_uri: string | null;
}): React.ReactElement | null {
  const { zone, canvas, text, logo_data_uri } = args;

  const px = pctRectToPx(zone.rect, canvas);

  // Special case: the brand_logo slot wants an image, not text.
  if (zone.slot === "brand_logo") {
    if (!logo_data_uri) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={zone.slot}
        src={logo_data_uri}
        alt=""
        style={{
          position: "absolute",
          top: px.y,
          left: px.x,
          width: px.width,
          height: px.height,
          objectFit: "contain",
        }}
      />
    );
  }

  const content = textForSlot(zone.slot, text);
  if (!content) return null;

  const fontConfig = fontForEmphasis(zone.emphasis, canvas);
  const justify = alignToJustify(zone.align);

  return (
    <div
      key={zone.slot}
      style={{
        position: "absolute",
        top: px.y,
        left: px.x,
        width: px.width,
        height: px.height,
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        textAlign: zone.align,
        color: "#FFFFFF",
        fontSize: fontConfig.size,
        fontWeight: fontConfig.weight,
        lineHeight: fontConfig.lineHeight,
        // Soft text shadow to keep copy readable across imperfect
        // backgrounds. Satori supports textShadow.
        textShadow: "0 2px 8px rgba(0,0,0,0.6)",
        whiteSpace: "pre-wrap",
        overflow: "hidden",
      }}
    >
      {content}
    </div>
  );
}

function textForSlot(slot: TextZone["slot"], text: RenderRequest["text"]): string | null {
  switch (slot) {
    case "headline":
      return nonEmpty(text.headline);
    case "caption":
      return nonEmpty(text.caption);
    case "cta":
      return nonEmpty(text.cta);
    case "banner":
      return nonEmpty(text.banner);
    case "brand_logo":
      return null; // handled separately
  }
}

function nonEmpty(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function pctRectToPx(
  rect: { x: number; y: number; width: number; height: number },
  canvas: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round((rect.x / 100) * canvas.width),
    y: Math.round((rect.y / 100) * canvas.height),
    width: Math.round((rect.width / 100) * canvas.width),
    height: Math.round((rect.height / 100) * canvas.height),
  };
}

function alignToJustify(align: Align): "flex-start" | "center" | "flex-end" {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

function fontForEmphasis(
  emphasis: TextZone["emphasis"],
  canvas: { width: number; height: number },
): { size: number; weight: 400 | 700; lineHeight: number } {
  // Sizes scale with the canvas's smaller dimension so portrait /
  // landscape / story formats get proportional text. A tighter
  // `lineHeight` for prominent text keeps headlines visually bold.
  const base = Math.min(canvas.width, canvas.height);
  switch (emphasis) {
    case "prominent":
      return { size: Math.round(base * 0.055), weight: 700, lineHeight: 1.1 };
    case "supporting":
      return { size: Math.round(base * 0.032), weight: 400, lineHeight: 1.3 };
    case "subtle":
      return { size: Math.round(base * 0.022), weight: 400, lineHeight: 1.3 };
  }
}

function gradientStyle(
  overlay: GradientOverlay,
  canvas: { width: number; height: number },
): React.CSSProperties {
  // Build a CSS linear-gradient string: dark at the chosen edge,
  // transparent at the opposite edge of the gradient extent.
  const dark = `rgba(0,0,0,${clamp01(overlay.intensity)})`;
  const clear = "rgba(0,0,0,0)";

  let gradient: string;
  let top: number, left: number, width: number, height: number;
  switch (overlay.direction) {
    case "bottom": {
      gradient = `linear-gradient(to top, ${dark}, ${clear})`;
      const h = Math.round((overlay.extent / 100) * canvas.height);
      top = canvas.height - h;
      left = 0;
      width = canvas.width;
      height = h;
      break;
    }
    case "top": {
      gradient = `linear-gradient(to bottom, ${dark}, ${clear})`;
      const h = Math.round((overlay.extent / 100) * canvas.height);
      top = 0;
      left = 0;
      width = canvas.width;
      height = h;
      break;
    }
    case "left": {
      gradient = `linear-gradient(to right, ${dark}, ${clear})`;
      const w = Math.round((overlay.extent / 100) * canvas.width);
      top = 0;
      left = 0;
      width = w;
      height = canvas.height;
      break;
    }
    case "right": {
      gradient = `linear-gradient(to left, ${dark}, ${clear})`;
      const w = Math.round((overlay.extent / 100) * canvas.width);
      top = 0;
      left = canvas.width - w;
      width = w;
      height = canvas.height;
      break;
    }
  }

  return {
    position: "absolute",
    top,
    left,
    width,
    height,
    backgroundImage: gradient,
    display: "flex",
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.6;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
