import type { StructuredPrompt } from "./prompt-builder";

/**
 * Turn a StructuredPrompt into the two strings the Anthropic Messages
 * API needs:
 *   - `system`: role-level guardrails, stable across providers
 *   - `user`: brand/source/platform/output-schema sections concatenated
 *
 * The prompt builder stays provider-agnostic. This serializer is
 * deliberately small so a future OpenAI (or other) path can do its own
 * serialization the same way.
 */
export function serializePromptForAnthropic(prompt: StructuredPrompt): {
  system: string;
  user: string;
} {
  const user = [
    ...prompt.sections.map((s) => `# ${s.heading}\n${s.body.trim()}`),
    serializeOutputSchema(prompt.sample_count, prompt.output_schema.fields),
  ].join("\n\n");

  return { system: prompt.system, user };
}

function serializeOutputSchema(
  sampleCount: number,
  fields: Record<string, string>,
): string {
  const fieldLines = Object.entries(fields)
    .map(([k, v]) => `  - "${k}": ${v}`)
    .join("\n");

  return [
    "# Output format (STRICT)",
    "Return ONLY a single JSON object — no prose, no markdown fences, no commentary.",
    "The object has exactly this shape:",
    "",
    "```",
    "{",
    '  "samples": [',
    "    {",
    '      "headline": "...",',
    '      "caption": "...",',
    '      "cta": "...",',
    '      "banner_text": "..." | null,',
    '      "image_prompt": "..."',
    "    }",
    "  ]",
    "}",
    "```",
    "",
    `Return EXACTLY ${sampleCount} item${sampleCount === 1 ? "" : "s"} in the "samples" array.`,
    "",
    "Field guidance:",
    fieldLines,
  ].join("\n");
}

/**
 * Assistant pre-fill used on the Messages API. Claude is much more
 * reliable about emitting clean JSON when the assistant turn is
 * pre-filled with the opening `{` — it continues the object rather
 * than wrapping it in prose. The response parser prepends this back
 * before parsing.
 */
export const ANTHROPIC_JSON_PREFILL = "{";
