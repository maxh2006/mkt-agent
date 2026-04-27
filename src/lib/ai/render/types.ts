// Deterministic overlay renderer — typed shapes.
//
// Product rule (locked — see docs/07-ai-boundaries.md):
//   - The renderer composites Post text + brand logos onto the AI-
//     generated background. Output is the FINAL publishable image
//     conceptually, but in MVP it lives only as metadata under
//     `Post.generation_context_json.composited_image` until the GCS
//     storage migration ships hosted https URLs that Manus media-
//     validation can dispatch. Post.image_url stays untouched.
//   - One composite per generation run; replicated to every sibling
//     draft via the queue inserter.
//   - Failure isolation: text drafts always ship even if the renderer
//     errors. Errors persist as a structured result.

import type {
  CompiledVisualPrompt,
  LayoutFamily,
  PlatformFormat,
  VisualEmphasis,
} from "@/lib/ai/visual/types";

/** Bumped when the persisted `composited_image` shape changes. */
export const RENDER_VERSION = "v1-2026-04-27";

export type RenderStatus = "ok" | "error";

/**
 * Inputs to the renderer. Built by the orchestrator from the AI run's
 * existing data — no new fields on the Brand / Event side.
 */
export interface RenderRequest {
  /**
   * AI background as a `data:` URI (Gemini path) or null (stub /
   * provider error / disabled). Null path triggers brand-color
   * fallback rendering — operators still get a usable composite.
   */
  background_artifact_url: string | null;

  /**
   * The compiled visual prompt is the source of truth for layout +
   * safe zones + platform format + visual emphasis. The renderer
   * does NOT re-resolve precedence — it consumes what
   * `compileVisualPrompt()` already produced.
   */
  visual: CompiledVisualPrompt;

  /**
   * Post text fields the AI emitted. The renderer composites these
   * verbatim — the prompt builder already shaped them to align with
   * the structured visual cues. Empty / null fields are skipped.
   */
  text: {
    headline: string | null;
    caption: string | null;
    cta: string | null;
    banner: string | null;
  };

  /**
   * Brand identity cues — colors used for fallback background +
   * logo lookup. The renderer picks `logos[layout.logo_slot.variant]`
   * (e.g. `horizontal`); empty / unreachable URLs are silently
   * skipped (logo is optional in the composite).
   */
  brand: {
    name: string;
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
    logos: {
      main: string | null;
      square: string | null;
      horizontal: string | null;
      vertical: string | null;
    };
  };

  /** Correlation for log lines. */
  trace: {
    brand_id: string;
    sample_group_id: string;
    source_type: string;
    platform: string;
  };
}

/**
 * The renderer's return shape. Mirrors `BackgroundImageResult` for
 * consistency with `image_generation` so operators / future code
 * read both blocks the same way.
 */
export interface CompositedImageResult {
  status: RenderStatus;

  /**
   * Composited PNG URL. After the GCS storage migration (2026-04-27),
   * this is `https://storage.googleapis.com/<bucket>/<path>` when
   * upload succeeded; `data:image/png;base64,…` (fallback metadata)
   * when storage is unconfigured; `null` on render failure or upload
   * failure. The orchestrator sets `Post.image_url` from this field
   * ONLY when it starts with `https://`.
   */
  artifact_url: string | null;
  width: number | null;
  height: number | null;

  /**
   * Raw PNG bytes — populated by the renderer on success, consumed
   * by the orchestrator's GCS upload step, and STRIPPED before the
   * queue inserter persists `composited_image` to
   * `generation_context_json` (these bytes are memory-only; the
   * `artifact_url` field is what's persisted).
   */
  png_bytes?: Uint8Array | null;

  // ── GCS upload metadata (populated by orchestrator after a
  //    successful storage upload; absent / null when upload was
  //    skipped or failed) ────────────────────────────────────────
  /** GCS bucket the artifact lives in. */
  bucket?: string | null;
  /** Object path within the bucket (deterministic per generation run). */
  object_path?: string | null;
  /** MIME type, typically "image/png". */
  mime_type?: string | null;
  /** Decoded byte length of the uploaded artifact. */
  byte_length?: number | null;
  /** ISO timestamp of the successful upload. */
  uploaded_at?: string | null;

  /**
   * Audit echo of which layout + platform format produced this
   * composite. Useful when debugging why a specific draft has the
   * dimensions it has.
   */
  layout_key: LayoutFamily;
  platform_format: PlatformFormat;
  /** Echoed from the compiled visual prompt for log / debug parity. */
  visual_emphasis: VisualEmphasis;

  /**
   * Set when the renderer fell back to a solid brand-color background
   * because no AI artifact was available. Operators see a usable
   * preview but should know it isn't the real Gemini output.
   */
  background_fallback: boolean;

  /** Whether a brand logo was actually drawn in the composite. */
  logo_drawn: boolean;

  /** Populated on `status: "error"`. */
  error_code: RenderErrorCode | null;
  error_message: string | null;

  generated_at: string;
  duration_ms: number;
  render_version: typeof RENDER_VERSION;
}

/**
 * Stable taxonomy for render + storage failures. Mirrors the
 * `ImageProviderErrorCode` shape so future operator UX (filters,
 * dashboards) can treat the two failure surfaces uniformly.
 *
 * STORAGE_* codes are added by the orchestrator's GCS upload step
 * (see `src/lib/storage/gcs.ts#StorageErrorCode`); the renderer
 * itself only emits the render-side codes.
 */
export type RenderErrorCode =
  | "MISSING_INPUTS"           // request shape is invalid (shouldn't happen at runtime)
  | "BACKGROUND_DECODE_FAILED" // data: URI was malformed or unreadable
  | "FONT_LOAD_FAILED"         // bundled font files missing / unreadable on disk
  | "SATORI_FAILED"            // JSX → SVG step threw
  | "RESVG_FAILED"             // SVG → PNG step threw
  | "STORAGE_NOT_CONFIGURED"   // orchestrator: GCS_ARTIFACT_BUCKET unset (skipped, not an error)
  | "STORAGE_AUTH_FAILED"      // orchestrator: ADC failed / SA missing role
  | "STORAGE_UPLOAD_FAILED"    // orchestrator: bucket OK, upload threw
  | "STORAGE_UNKNOWN"          // orchestrator: unclassified storage failure
  | "UNKNOWN";

/** Synthesizer for error results — lets callers stay terse. */
export function buildRenderErrorResult(args: {
  request: RenderRequest;
  error_code: RenderErrorCode;
  error_message: string;
  generated_at: string;
  duration_ms: number;
}): CompositedImageResult {
  return {
    status: "error",
    artifact_url: null,
    width: null,
    height: null,
    layout_key: args.request.visual.layout_key,
    platform_format: args.request.visual.platform_format,
    visual_emphasis: args.request.visual.visual_emphasis,
    background_fallback: false,
    logo_drawn: false,
    error_code: args.error_code,
    error_message: args.error_message,
    generated_at: args.generated_at,
    duration_ms: args.duration_ms,
    render_version: RENDER_VERSION,
  };
}
