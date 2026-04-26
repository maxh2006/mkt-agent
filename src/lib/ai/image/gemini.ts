// Gemini / Nano Banana 2 image-generation adapter.
//
// Product naming:
//   - "Nano Banana 2" is the marketing name.
//   - `gemini-3.1-flash-image-preview` is the developer model id used in
//     code + env config. Override via `AI_IMAGE_MODEL`.
//
// Auth path (DOCUMENT EVERY TIME YOU READ THIS — the Anthropic credits
// experience burned us with a wired-but-unusable provider):
//   - API key flow only. We do NOT use Vertex AI / ADC for this — too
//     much GCP setup for a model that's served identically from the
//     Gemini API endpoint.
//   - Required env: `GEMINI_API_KEY` (get from Google AI Studio at
//     https://aistudio.google.com/apikey). The linked Google Cloud
//     project MUST have billing enabled — free-tier keys hit hard
//     quota limits and fall over with 429 / 403 PERMISSION_DENIED on
//     production-volume traffic.
//   - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`.
//   - Auth header: `x-goog-api-key: <key>` (preferred over query-param;
//     keeps the key out of access logs).
//   - Full prod flip procedure + verification curl in docs/08-deployment.md.
//
// MVP storage decision (locked 2026-04-27):
//   - Gemini returns inline base64-encoded image bytes (NOT a hosted
//     URL). For the smallest clean MVP persistence path, we encode the
//     bytes as a `data:` URI and store it in
//     `image_generation.artifact_url`. This works end-to-end without
//     introducing a storage stack today (no GCS bucket, no Nginx
//     alias, no filesystem permissions to manage).
//   - DB cost: data URIs in `generation_context_json` add ~100KB-1MB
//     per draft. Acceptable while volume is low (Anthropic credits
//     aren't even paid up). Migrating to GCS-backed `artifact_url`
//     when volume warrants is a follow-up — the contract field is the
//     same; only the URL scheme changes (`data:` → `https://`).
//
// Adapter scope (DELIBERATELY narrow):
//   - One model: `gemini-3.1-flash-image-preview` (default).
//   - One auth path: API key.
//   - One output shape: data URI in `artifact_url`.
//   - Errors map to the canonical `ImageProviderErrorCode` taxonomy.
//   - Failures throw normalized Errors that the orchestrator catches
//     into `status: "error"` results — text drafts still ship.

import { RENDER_VERSION } from "./types";
import type {
  BackgroundImageRequest,
  BackgroundImageResult,
  ImageProviderErrorCode,
} from "./types";

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta";
/**
 * 60s ceiling on the Gemini call. Image generation is typically 5-15s;
 * 60s is comfortable headroom without letting a hung provider stall
 * the whole orchestrator. The orchestrator's try/catch turns a timeout
 * into a `NETWORK_ERROR` result.
 */
const REQUEST_TIMEOUT_MS = 60_000;

// ─── Public entry ──────────────────────────────────────────────────────────

export async function geminiProvider(
  request: BackgroundImageRequest,
): Promise<BackgroundImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fail loud — silent stub fallback would mask a real misconfig
    // that the operator needs to see during initial rollout. This
    // mirrors the AI_PROVIDER=anthropic + ANTHROPIC_API_KEY pattern
    // in src/lib/ai/client.ts.
    throw new Error(
      "AI_IMAGE_PROVIDER=gemini but GEMINI_API_KEY is not set. Configure the key (Google AI Studio → https://aistudio.google.com/apikey) or switch AI_IMAGE_PROVIDER to 'stub'.",
    );
  }

  const model = process.env.AI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const startedAt = Date.now();
  const generatedAt = new Date(startedAt).toISOString();

  // Compose the prompt: the visual compiler's positive prompt is already
  // self-contained (style, emphasis, subject, format hint, safe-zone
  // instruction, "no text" rule). Append the negative prompt as
  // explicit avoidance text — Gemini's API has no separate negative-
  // prompt field, so it lives in the main prompt body.
  const fullPrompt = composePromptForGemini(request);

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: fullPrompt }],
      },
    ],
    generationConfig: {
      // Image-only response. Some Gemini image models accept
      // ["TEXT", "IMAGE"]; we deliberately request IMAGE-only to
      // avoid round-tripping a text rationale we don't use.
      responseModalities: ["IMAGE"],
    },
  };

  const url = `${ENDPOINT_BASE}/models/${encodeURIComponent(model)}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Network failure";
    return errorResult({
      request,
      model,
      generatedAt,
      durationMs: Date.now() - startedAt,
      code: "NETWORK_ERROR",
      message: isAbort
        ? `Gemini request aborted after ${REQUEST_TIMEOUT_MS}ms timeout`
        : `Gemini network failure: ${message}`,
    });
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const code = mapHttpStatusToErrorCode(res.status, text);
    const message = `Gemini ${res.status} ${res.statusText}: ${truncate(text, 500)}`;
    return errorResult({
      request,
      model,
      generatedAt,
      durationMs: Date.now() - startedAt,
      code,
      message,
    });
  }

  const json = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!json) {
    return errorResult({
      request,
      model,
      generatedAt,
      durationMs: Date.now() - startedAt,
      code: "UNKNOWN",
      message: "Gemini response was not valid JSON",
    });
  }

  // Look for the first inline-data part across all candidates.
  const inline = extractInlineImage(json);
  if (!inline) {
    // Some failure modes return 200 with `promptFeedback.blockReason`
    // populated and no inline data — that's a content-policy reject.
    const block = json.promptFeedback?.blockReason;
    if (block) {
      return errorResult({
        request,
        model,
        generatedAt,
        durationMs: Date.now() - startedAt,
        code: "POLICY_REJECTED",
        message: `Gemini blocked the prompt: ${block}${json.promptFeedback?.blockReasonMessage ? ` — ${json.promptFeedback.blockReasonMessage}` : ""}`,
      });
    }
    return errorResult({
      request,
      model,
      generatedAt,
      durationMs: Date.now() - startedAt,
      code: "UNKNOWN",
      message: "Gemini response contained no inline image data",
    });
  }

  // Success. Encode as a data URI so downstream code (queue inserter,
  // future overlay renderer) can read it without going to disk or
  // hitting a CDN. Width/height aren't returned in the Gemini response
  // shape — leaving null. The overlay renderer can decode the data URI
  // to discover dimensions if it needs them.
  const dataUri = `data:${inline.mimeType};base64,${inline.data}`;

  console.log(
    `[ai-image] gemini source=${request.trace.source_type} brand=${request.trace.brand_id} group=${request.trace.sample_group_id} model=${model} format=${request.platform_format} bytes=~${Math.round((inline.data.length * 3) / 4)} duration_ms=${Date.now() - startedAt}`,
  );

  return {
    status: "ok",
    provider: "gemini",
    model,
    artifact_url: dataUri,
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

// ─── Internals ──────────────────────────────────────────────────────────────

function composePromptForGemini(request: BackgroundImageRequest): string {
  const parts: string[] = [];
  // The visual compiler's positive prompt is self-contained — pass it
  // verbatim. Gemini reads natural language well; no XML tagging needed.
  parts.push(request.background_image_prompt);

  // Append the negative prompt as an explicit avoidance instruction.
  // The compiler already includes the hardcoded "no text in image"
  // baseline, so this is a belt-and-braces reinforcement using the
  // exact taxonomy the operator + brand defined.
  if (request.negative_prompt && request.negative_prompt.trim().length > 0) {
    parts.push(
      `Avoid the following elements entirely: ${request.negative_prompt}.`,
    );
  }

  // Format hint at the end so the model treats it as the resolution
  // anchor. The compiler already injects a "Target aspect ratio: …"
  // line earlier, so this is reinforcement.
  parts.push(formatHint(request.platform_format));

  return parts.join("\n\n");
}

function formatHint(format: BackgroundImageRequest["platform_format"]): string {
  switch (format) {
    case "square":
      return "Output a square 1:1 image suitable for Instagram and Facebook feeds.";
    case "portrait":
      return "Output a 4:5 portrait image suitable for Instagram feed and Reels.";
    case "landscape":
      return "Output a 16:9 landscape image suitable for Twitter/X and Facebook.";
    case "story":
      return "Output a 9:16 vertical story image suitable for Instagram and Facebook stories.";
  }
}

function mapHttpStatusToErrorCode(
  status: number,
  bodyText: string,
): ImageProviderErrorCode {
  if (status === 400) {
    // Gemini returns 400 for both malformed payloads and
    // safety-blocked prompts. The body text usually distinguishes —
    // surface that to the operator.
    if (/safety|policy|blocked/i.test(bodyText)) return "POLICY_REJECTED";
    return "INVALID_PROMPT";
  }
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500 && status < 600) return "TEMPORARY_UPSTREAM";
  return "UNKNOWN";
}

function errorResult(args: {
  request: BackgroundImageRequest;
  model: string;
  generatedAt: string;
  durationMs: number;
  code: ImageProviderErrorCode;
  message: string;
}): BackgroundImageResult {
  console.warn(
    `[ai-image] gemini FAILED source=${args.request.trace.source_type} brand=${args.request.trace.brand_id} group=${args.request.trace.sample_group_id} model=${args.model} code=${args.code} err=${args.message}`,
  );
  return {
    status: "error",
    provider: "gemini",
    model: args.model,
    artifact_url: null,
    provider_asset_id: null,
    width: null,
    height: null,
    background_image_prompt: args.request.background_image_prompt,
    negative_prompt: args.request.negative_prompt,
    skipped_reason: null,
    error_code: args.code,
    error_message: args.message,
    generated_at: args.generatedAt,
    duration_ms: args.durationMs,
    render_version: RENDER_VERSION,
  };
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

// ─── Response shape (subset; just what we read) ─────────────────────────────

interface InlineDataPart {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
}

interface GeminiCandidate {
  content?: {
    parts?: InlineDataPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
}

function extractInlineImage(
  json: GeminiResponse,
): { mimeType: string; data: string } | null {
  const candidates = json.candidates ?? [];
  for (const c of candidates) {
    const parts = c.content?.parts ?? [];
    for (const p of parts) {
      const inline = p.inlineData;
      if (inline?.data && inline.mimeType) {
        return { mimeType: inline.mimeType, data: inline.data };
      }
    }
  }
  return null;
}
