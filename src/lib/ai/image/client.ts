// Background-image provider boundary — switch + stub.
//
// Mirrors the text provider at `src/lib/ai/client.ts`:
//   - `generateBackgroundImage()` reads `AI_IMAGE_PROVIDER` and
//     dispatches to the right adapter. Default is `stub` (deterministic
//     placeholder, zero cost, prod-safe).
//   - Real providers (Gemini / Imagen / Stability / etc.) slot in as
//     additional case branches. Each adapter is responsible for
//     reading its own env keys and FAILING LOUD when selected but
//     misconfigured — silent fallback to stub would mask real
//     misconfigurations during initial rollout.
//   - The orchestrator (`runGeneration`) wraps this call in try/catch
//     so text drafts still ship if image generation throws.
//
// What this module DELIBERATELY does NOT do:
//   - composite text + logos onto the background (that's the deferred
//     deterministic overlay renderer)
//   - mutate `Post.image_url` (reserved for the final composited asset
//     produced by the overlay renderer — see queue-inserter)
//   - fetch reference assets / call BigQuery / read brand JSON
//     directly — its only inputs are `BackgroundImageRequest` shapes
//     constructed by the orchestrator from the compiled visual prompt.

import {
  RENDER_VERSION,
  buildImageErrorResult,
  type BackgroundImageRequest,
  type BackgroundImageResult,
  type ImageProvider,
} from "./types";
import { geminiProvider } from "./gemini";

/**
 * Public entry. Returns a `BackgroundImageResult` regardless of provider
 * outcome — `status: "ok" | "skipped" | "error"` carries the meaning.
 *
 * Throws ONLY on configuration errors that the operator MUST see during
 * initial rollout (e.g. real provider selected but env not configured).
 * Runtime provider failures are returned as `status: "error"` so the
 * orchestrator can persist them without aborting the whole run.
 */
export async function generateBackgroundImage(
  request: BackgroundImageRequest,
): Promise<BackgroundImageResult> {
  const provider = (process.env.AI_IMAGE_PROVIDER ?? "stub").toLowerCase() as ImageProvider;

  switch (provider) {
    case "stub":
      return stubProvider(request);

    case "gemini":
      // Nano Banana 2 / Gemini API adapter (default model
      // gemini-3.1-flash-image-preview, override via AI_IMAGE_MODEL).
      // Auth path: GEMINI_API_KEY (Google AI Studio) — see
      // docs/08-deployment.md for the prod flip procedure.
      return geminiProvider(request);

    case "imagen":
    case "stability":
      // Real-provider adapters land in follow-up tasks. The contract is
      // locked: they accept a BackgroundImageRequest and resolve to a
      // BackgroundImageResult, mapping provider-specific errors onto
      // the canonical `ImageProviderErrorCode` taxonomy.
      throw new Error(
        `AI_IMAGE_PROVIDER=${provider} is recognised but its adapter is not implemented yet. Set AI_IMAGE_PROVIDER=stub or AI_IMAGE_PROVIDER=gemini, or implement the adapter in src/lib/ai/image/.`,
      );

    default:
      // Unknown value. Fail loud — silent fallback to stub here would
      // mask a typo in production env that the operator needs to see.
      throw new Error(
        `Unknown AI_IMAGE_PROVIDER='${process.env.AI_IMAGE_PROVIDER}'. Valid values: stub, gemini, imagen, stability.`,
      );
  }
}

// ─── Stub provider ──────────────────────────────────────────────────────────
//
// Deterministic placeholder. Returns a synthetic `ok` result with no
// real artifact URL — `artifact_url` is null so downstream code never
// mistakes it for a real image. Pipeline runs end-to-end with zero cost
// and zero external dependency. Marked clearly so operators can filter
// stub-generated drafts in any future image inspector UI.

function stubProvider(request: BackgroundImageRequest): BackgroundImageResult {
  const startedAt = Date.now();
  const generatedAt = new Date(startedAt).toISOString();

  console.log(
    `[ai-image] stub provider source=${request.trace.source_type} brand=${request.trace.brand_id} platform=${request.trace.platform} format=${request.platform_format} layout=${request.layout_key} emphasis=${request.visual_emphasis}`,
  );

  // The stub deliberately returns `status: "ok"` rather than `skipped`
  // so downstream code paths exercise the success branch in dev. The
  // null `artifact_url` is the unambiguous signal that no real image
  // exists. Future overlay renderer will treat null-artifact_url as
  // "render the placeholder background" or skip image rendering
  // entirely depending on its design.
  return {
    status: "ok",
    provider: "stub",
    model: null,
    artifact_url: null,
    provider_asset_id: null,
    width: null,
    height: null,
    background_image_prompt: request.background_image_prompt,
    negative_prompt: request.negative_prompt,
    skipped_reason: null,
    error_code: null,
    error_message: null,
    generated_at: generatedAt,
    duration_ms: Date.now() - startedAt,
    render_version: RENDER_VERSION,
  };
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { RENDER_VERSION, buildImageErrorResult };
export type { BackgroundImageRequest, BackgroundImageResult, ImageProvider };
