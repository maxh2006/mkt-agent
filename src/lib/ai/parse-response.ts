import { z } from "zod";
import type { GeneratedSample } from "./types";

/**
 * Parse a provider's raw text response into the canonical
 * `GeneratedSample[]`.
 *
 * Handles three common failure modes:
 *   1. Model wrapped the JSON in markdown fences (```json ... ```)
 *   2. Model prefixed/suffixed the JSON with prose
 *   3. Model emitted a sample_count that doesn't match what we asked for
 *
 * On any unrecoverable parse/validation failure, throws a clear Error so
 * the caller's per-slot try/catch surfaces it to the operator. We
 * intentionally do NOT fall back to stub output — silent degradation is
 * worse than a visible failure during the first real-provider runs.
 */

const sampleSchema = z.object({
  headline: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  cta: z.string().trim().min(1),
  banner_text: z.union([z.string().trim(), z.null()]).optional().transform((v) => {
    if (v === null || v === undefined) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
  image_prompt: z.string().trim().min(1),
});

const responseSchema = z.object({
  samples: z.array(sampleSchema).min(1),
});

/**
 * Extract the `samples` array from a provider's text response.
 *
 * @param rawText   The assistant's text output. Caller is responsible for
 *                  prepending any pre-fill token (e.g. `{`) before
 *                  passing here.
 * @param expectedSampleCount  The `sample_count` the prompt asked for.
 *                             If the response has more we truncate; if
 *                             fewer we throw.
 */
export function parseGeneratedSamples(
  rawText: string,
  expectedSampleCount: number,
): GeneratedSample[] {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    throw new Error(
      `Provider response did not contain a parseable JSON object (first 200 chars: ${rawText.slice(0, 200)})`,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `Provider response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = responseSchema.safeParse(parsedJson);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Provider response failed schema validation: ${issues}`);
  }

  const samples = result.data.samples.map((s): GeneratedSample => ({
    headline: s.headline,
    caption: s.caption,
    cta: s.cta,
    banner_text: s.banner_text ?? null,
    image_prompt: s.image_prompt,
  }));

  if (samples.length < expectedSampleCount) {
    throw new Error(
      `Provider returned ${samples.length} sample(s) but ${expectedSampleCount} were requested`,
    );
  }

  // Extra samples are tolerated (truncate) — models occasionally add one
  // and it's harmless; stopping the run would be worse.
  return samples.slice(0, expectedSampleCount);
}

/**
 * Pull the first top-level JSON object out of arbitrary model text.
 *
 * Handles:
 *   - Pure JSON   `{"samples":...}`               → returned verbatim
 *   - Markdown    ` ```json\n{...}\n``` `         → fence stripped
 *   - Prose-wrap  `Here you go: {...}. Thanks!`   → object extracted
 *
 * Naive balanced-brace scan is intentional. It's robust for the output
 * shape we control (no nested unquoted strings with braces). Not a
 * general JSON-in-prose extractor.
 */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  // Strip optional ```json fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    const inner = fenceMatch[1].trim();
    if (inner.startsWith("{")) return inner;
  }

  // Balanced-brace scan
  const startIdx = trimmed.indexOf("{");
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(startIdx, i + 1);
    }
  }
  return null;
}
