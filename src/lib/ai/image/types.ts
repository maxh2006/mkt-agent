// Background-image provider boundary — typed shapes.
//
// Product rule (locked — see docs/07-ai-boundaries.md):
//   - The image provider produces a BACKGROUND artifact. Final text +
//     logos are composited later by a deterministic overlay renderer
//     (still deferred). Operators never publish the background-only
//     image as the final creative without that overlay step.
//   - The provider input is the `CompiledVisualPrompt` shape (already
//     produced by `src/lib/ai/visual/compile.ts`). Free-form prompt
//     authoring stays out of the provider — it always consumes the
//     compiler output.
//
// Module shape mirrors the text-provider boundary at `src/lib/ai/client.ts`:
//   - one switch function (`generateBackgroundImage`)
//   - one stub provider (deterministic, zero-cost, prod-safe default)
//   - real providers added later behind env-based opt-in, fail-loud on
//     misconfig (no silent fallback to stub when a real provider is
//     selected — matches the AI_PROVIDER=anthropic pattern).

import type {
  LayoutFamily,
  PlatformFormat,
  SafeZoneConfig,
  VisualEmphasis,
} from "@/lib/ai/visual/types";

/** Bumped when the persisted `image_generation` shape changes. */
export const RENDER_VERSION = "v1-2026-04-27";

/** Provider switch values (extend as real adapters land). */
export type ImageProvider = "stub" | "gemini" | "imagen" | "stability";

/** Status of a single background-image generation attempt. */
export type ImageGenerationStatus =
  | "ok"        // artifact produced (real or stub placeholder)
  | "skipped"   // provider deliberately produced no artifact (e.g. dry-run flag)
  | "error";    // provider call attempted and failed; error fields populated

/**
 * Input to the provider. Constructed in the orchestrator from the
 * compiled visual prompt + a few correlation fields. Pure data — no
 * functions, no Promises.
 */
export interface BackgroundImageRequest {
  // ── From CompiledVisualPrompt ─────────────────────────────────────────
  background_image_prompt: string;
  negative_prompt: string;
  platform_format: PlatformFormat;
  layout_key: LayoutFamily;
  safe_zone_config: SafeZoneConfig;
  subject_focus: string;
  visual_emphasis: VisualEmphasis;

  // ── Brand identity cues (optional — adapters that support them use it) ─
  brand_palette?: {
    primary: string | null;
    secondary: string | null;
    accent: string | null;
  };

  // ── Correlation / observability ───────────────────────────────────────
  trace: {
    brand_id: string;
    sample_group_id: string;
    /** Source type for observability log lines. */
    source_type: string;
    /** Target platform for observability log lines. */
    platform: string;
  };
}

/**
 * Result the provider returns. The queue inserter writes a stripped-down
 * version of this into `generation_context_json.image_generation` for
 * every sibling draft in a run. The future overlay renderer reads
 * `artifact_url` (when status === "ok") to fetch the background.
 */
export interface BackgroundImageResult {
  status: ImageGenerationStatus;
  provider: ImageProvider;
  /** Provider-specific model identifier when applicable; null for stub. */
  model: string | null;

  // ── Artifact (populated on status === "ok") ───────────────────────────
  /** Public or signed URL of the generated artifact. Null on skipped/error. */
  artifact_url: string | null;
  /** Provider-side asset id when the provider returns one. */
  provider_asset_id: string | null;
  width: number | null;
  height: number | null;

  // ── Echo for audit (always populated; downstream may or may not use) ──
  background_image_prompt: string;
  negative_prompt: string;

  // ── Why we did or didn't do work (populated on skipped or error) ──────
  /** Human-readable reason when status === "skipped". */
  skipped_reason: string | null;
  /** Stable taxonomy code when status === "error". */
  error_code: ImageProviderErrorCode | null;
  /** Human-readable error message; provider-side text normalized to safe content. */
  error_message: string | null;

  // ── Timestamps ────────────────────────────────────────────────────────
  generated_at: string; // ISO
  /** Wall-clock time spent in the provider call (and our marshaling). */
  duration_ms: number;
  /** Schema/version tag for the persisted block. Bump on shape changes. */
  render_version: typeof RENDER_VERSION;
}

/**
 * Canonical error codes for the image provider boundary. Mirrors the
 * shape of `ManusErrorCode` so future operator UX (retry / fix-first
 * classifiers) can re-use the same pattern. Stable across providers —
 * adapters map provider-specific errors into these.
 */
export type ImageProviderErrorCode =
  | "NOT_CONFIGURED"      // selected provider but env not set; raised by adapter
  | "AUTH_ERROR"          // provider rejected our credentials
  | "RATE_LIMITED"        // provider throttled
  | "INVALID_PROMPT"      // provider rejected our prompt as malformed
  | "POLICY_REJECTED"     // provider's content policy refused
  | "TEMPORARY_UPSTREAM"  // transient upstream failure
  | "NETWORK_ERROR"       // connection / timeout
  | "UNKNOWN";

/**
 * Helper to build a synthetic error result the orchestrator uses when
 * the provider call throws. Keeps the shape identical regardless of
 * which adapter raised — operators / future code see one contract.
 */
export function buildImageErrorResult(args: {
  provider: ImageProvider;
  model: string | null;
  request: BackgroundImageRequest;
  error_code: ImageProviderErrorCode;
  error_message: string;
  generated_at: string;
  duration_ms: number;
}): BackgroundImageResult {
  return {
    status: "error",
    provider: args.provider,
    model: args.model,
    artifact_url: null,
    provider_asset_id: null,
    width: null,
    height: null,
    background_image_prompt: args.request.background_image_prompt,
    negative_prompt: args.request.negative_prompt,
    skipped_reason: null,
    error_code: args.error_code,
    error_message: args.error_message,
    generated_at: args.generated_at,
    duration_ms: args.duration_ms,
    render_version: RENDER_VERSION,
  };
}
