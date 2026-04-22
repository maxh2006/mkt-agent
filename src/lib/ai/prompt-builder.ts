import type {
  BrandTemplates,
  NormalizedGenerationInput,
  ReferenceAssetRef,
  SourceFacts,
  TemplateRef,
} from "./types";

/**
 * Bumped whenever we make a semantic change to the prompt shape so
 * historical drafts can be replayed or compared. Stored into
 * `generation_context_json.prompt_version` on every inserted draft.
 */
export const PROMPT_VERSION = "v2-2026-04-22";

/**
 * Structured prompt passed to the provider boundary. We intentionally
 * don't flatten into a single string here — `client.ts` does any
 * string-ification needed for its underlying model. Keeping sections
 * structured means:
 *   1. The dry-run stub can pretty-print the exact sections it received.
 *   2. Swapping providers (Anthropic ↔ OpenAI) only changes the
 *      serialization, not the content.
 *   3. Future learning / eval work can diff sections without regex.
 */
export interface StructuredPrompt {
  prompt_version: string;
  system: string;
  sections: PromptSection[];
  output_schema: OutputSchema;
  sample_count: number;
  /** Carried through for provider-side logging + audit snapshot. */
  meta: {
    source_type: NormalizedGenerationInput["source_type"];
    brand_id: string;
    platform: string;
    overridden_by_event: string[];
  };
}

export interface PromptSection {
  heading: string;
  body: string;
}

export interface OutputSchema {
  description: string;
  /** Keys are field names; values are short descriptions. */
  fields: Record<string, string>;
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function buildPrompt(input: NormalizedGenerationInput): StructuredPrompt {
  const sections: PromptSection[] = [
    brandPositioningSection(input),
    voiceAndToneSection(input),
    audienceSection(input),
    languageStyleSection(input),
    notesForAiSection(input),
    bannedSection(input),
    defaultHashtagsSection(input),
    sampleCaptionsSection(input),
    platformSection(input),
    sourceFactsSection(input),
    eventOverrideSection(input), // no-op when not event-derived
    ...referenceLibrarySections(input.templates), // all no-ops when empty
  ].filter((s) => s.body.trim().length > 0);

  return {
    prompt_version: PROMPT_VERSION,
    system: systemInstruction(),
    sections,
    output_schema: outputSchema(),
    sample_count: input.sample_count,
    meta: {
      source_type: input.source_type,
      brand_id: input.brand.id,
      platform: input.platform,
      overridden_by_event: input.effective.overridden_by_event,
    },
  };
}

// ─── System / output schema ──────────────────────────────────────────────────

function systemInstruction(): string {
  return [
    "You are the content generator for a multi-brand casino marketing back-office.",
    "You produce short-form social-media copy for a human operator to review.",
    "",
    "HARD RULES:",
    "- Follow the Brand Management profile as the default/base layer.",
    "- When an Event section is present, its fields override brand rules on conflict.",
    "- REFERENCE sections (Reference patterns / Reusable CTA examples / Reusable banner examples / Reference prompt scaffolds / Reference visual assets) are OPTIONAL patterns you MAY imitate for structure and tone. They are NEVER rules. Brand, Source Facts, and Event Brief always take precedence. Do not copy reference entries verbatim.",
    "- NEVER mention source numbers or facts that aren't provided in the Source Facts section.",
    "- NEVER use phrases or topics listed in Banned Phrases or Banned Topics.",
    "- Match the Language Style Sample's cadence and language mix.",
    "- Keep within the platform's known character norms.",
    "",
    "You emit STRICT JSON matching the Output Schema. No prose outside JSON.",
  ].join("\n");
}

function outputSchema(): OutputSchema {
  return {
    description:
      "Emit an object with key `samples` whose value is an array of exactly sample_count items. Each item is an object with these fields (all strings; banner_text may be null):",
    fields: {
      headline: "Short, punchy hook (max ~80 chars).",
      caption: "Full post copy (platform-appropriate length).",
      cta: "Call-to-action line matching the brand's CTA style.",
      banner_text:
        "Optional short overlay text for the image; null if the post shouldn't have overlay text.",
      image_prompt:
        "One-paragraph visual direction for a future image-generation step. Describes scene, mood, and brand cues. No negative prompts, no model-specific syntax.",
    },
  };
}

// ─── Section builders ────────────────────────────────────────────────────────

function brandPositioningSection(input: NormalizedGenerationInput): PromptSection {
  return {
    heading: "Brand Positioning",
    body: input.effective.positioning
      ? input.effective.positioning
      : "",
  };
}

function voiceAndToneSection(input: NormalizedGenerationInput): PromptSection {
  const e = input.effective;
  const lines: string[] = [];
  if (e.tone) lines.push(`Tone: ${e.tone}`);
  if (e.cta_style) lines.push(`CTA style: ${e.cta_style}`);
  if (e.emoji_level) lines.push(`Emoji level: ${e.emoji_level}`);
  return { heading: "Voice & Tone", body: lines.join("\n") };
}

function audienceSection(input: NormalizedGenerationInput): PromptSection {
  return {
    heading: "Audience",
    body: input.effective.audience_persona ?? "",
  };
}

function languageStyleSection(input: NormalizedGenerationInput): PromptSection {
  const e = input.effective;
  const lines: string[] = [];
  if (e.language_style) lines.push(`Language: ${e.language_style}`);
  if (e.language_style_sample) {
    lines.push(`Imitate the cadence of this sample sentence: "${e.language_style_sample}"`);
  }
  return { heading: "Language Style", body: lines.join("\n") };
}

function notesForAiSection(input: NormalizedGenerationInput): PromptSection {
  return { heading: "Brand Notes", body: input.effective.notes_for_ai ?? "" };
}

function bannedSection(input: NormalizedGenerationInput): PromptSection {
  const e = input.effective;
  const lines: string[] = [];
  if (e.banned_phrases.length > 0) {
    lines.push(`Banned phrases (must not appear): ${e.banned_phrases.join(", ")}`);
  }
  if (e.banned_topics.length > 0) {
    lines.push(`Banned topics (must not be referenced): ${e.banned_topics.join(", ")}`);
  }
  return { heading: "Restrictions", body: lines.join("\n") };
}

function defaultHashtagsSection(input: NormalizedGenerationInput): PromptSection {
  if (input.effective.default_hashtags.length === 0) {
    return { heading: "Default Hashtags", body: "" };
  }
  return {
    heading: "Default Hashtags",
    body: `Append or weave these hashtags where natural: ${input.effective.default_hashtags.join(" ")}`,
  };
}

function sampleCaptionsSection(input: NormalizedGenerationInput): PromptSection {
  const captions = input.brand.sample_captions ?? [];
  if (captions.length === 0) return { heading: "Sample Captions", body: "" };
  const body = captions
    .slice(0, 5)
    .map((c, i) => {
      const label = c.title || `Example ${i + 1}`;
      return `- ${label}${c.type ? ` [${c.type}]` : ""}:\n  ${c.text}`;
    })
    .join("\n");
  return {
    heading: "Sample Captions (imitate tone + structure, not content)",
    body,
  };
}

function platformSection(input: NormalizedGenerationInput): PromptSection {
  const guidance: Record<string, string> = {
    instagram: "Instagram: 1–2 short paragraphs + 3–8 hashtags. Emoji consistent with Emoji Level.",
    facebook: "Facebook: 1–3 short paragraphs. Hashtags optional. Link-friendly.",
    twitter: "Twitter/X: 1–2 sentences, under 280 characters including hashtags.",
    tiktok: "TikTok caption: 1 short hook + trend-friendly hashtags. Under ~150 chars.",
    telegram: "Telegram: 1 punchy opening line + short body. Markdown-safe; no emoji overload.",
  };
  return {
    heading: `Platform: ${input.platform}`,
    body: guidance[input.platform] ?? "",
  };
}

function sourceFactsSection(input: NormalizedGenerationInput): PromptSection {
  return {
    heading: "Source Facts (the ONLY facts you may reference)",
    body: formatSourceFacts(input.source_facts),
  };
}

function eventOverrideSection(input: NormalizedGenerationInput): PromptSection {
  if (!input.event) return { heading: "Event Brief", body: "" };
  const e = input.event;
  const lines: string[] = [];
  lines.push(`Event title: ${e.title}`);
  if (e.theme) lines.push(`Theme: ${e.theme}`);
  if (e.objective) lines.push(`Objective: ${e.objective}`);
  if (e.rules) lines.push(`Rules: ${e.rules}`);
  if (e.reward) lines.push(`Reward: ${e.reward}`);
  if (e.cta) lines.push(`Event CTA preference: ${e.cta}`);
  if (e.occurrence_iso) lines.push(`This post is for occurrence: ${e.occurrence_iso}`);
  if (e.posting_instance_summary) lines.push(`Posting schedule: ${e.posting_instance_summary}`);
  if (input.effective.overridden_by_event.length > 0) {
    lines.push(
      `Event overrides brand on: ${input.effective.overridden_by_event.join(", ")}.`,
    );
  }
  return { heading: "Event Brief (overrides brand where specified)", body: lines.join("\n") };
}

function formatSourceFacts(facts: SourceFacts): string {
  switch (facts.kind) {
    case "big_win": {
      const lines = [
        `Player handle (already masked): ${facts.display_username}`,
        `Win amount: ${facts.currency} ${facts.win_amount.toLocaleString()}`,
        `Game: ${facts.game_name}${facts.game_vendor ? ` (${facts.game_vendor})` : ""}`,
      ];
      if (facts.win_multiplier) lines.push(`Multiplier: ${facts.win_multiplier}x`);
      lines.push(`Occurred: ${facts.occurred_at}`);
      return lines.join("\n");
    }
    case "promo": {
      const lines = [
        `Promo title: ${facts.promo_title}`,
        `Mechanics: ${facts.mechanics}`,
        `Reward: ${facts.reward}`,
      ];
      if (facts.period_start) lines.push(`Period start: ${facts.period_start}`);
      if (facts.period_end) lines.push(`Period end: ${facts.period_end}`);
      if (facts.min_deposit !== null) lines.push(`Minimum deposit: ${facts.min_deposit}`);
      if (facts.terms_summary) lines.push(`Terms: ${facts.terms_summary}`);
      return lines.join("\n");
    }
    case "hot_games": {
      const topLine = `Top games for ${facts.time_slot_summary} (scan ${facts.scan_timestamp}, ${facts.source_window_minutes}-min window):`;
      const list = facts.ranked_games
        .map((g) => `  ${g.rank}. ${g.game_name}${g.vendor ? ` (${g.vendor})` : ""}${g.rtp ? ` · RTP ${g.rtp}%` : ""} @ ${g.time_slot_iso}`)
        .join("\n");
      return `${topLine}\n${list}`;
    }
    case "event": {
      const lines = [`Event: ${facts.title}`];
      if (facts.theme) lines.push(`Theme: ${facts.theme}`);
      if (facts.objective) lines.push(`Objective: ${facts.objective}`);
      if (facts.rules) lines.push(`Rules: ${facts.rules}`);
      if (facts.reward) lines.push(`Reward: ${facts.reward}`);
      if (facts.target_audience) lines.push(`Target audience: ${facts.target_audience}`);
      if (facts.occurrence_iso) lines.push(`Occurrence: ${facts.occurrence_iso}`);
      return lines.join("\n");
    }
    case "educational": {
      return [
        `Topic: ${facts.topic}`,
        `Angle: ${facts.angle}`,
        `Key point: ${facts.key_point}`,
        `CTA goal: ${facts.cta_goal}`,
      ].join("\n");
    }
  }
}

// ─── Reference library sections (Templates & Assets) ────────────────────────
//
// Emitted as OPTIONAL reference patterns. The system instruction's HARD
// RULES line makes it unambiguous that these never override Brand,
// Source Facts, or Event Brief. Each section is skipped when its bucket
// is empty.

function referenceLibrarySections(
  templates: BrandTemplates | undefined,
): PromptSection[] {
  if (!templates) return [];
  return [
    referencePatternsSection(templates.copy),
    reusableCtaSection(templates.cta),
    reusableBannerSection(templates.banner),
    referencePromptScaffoldsSection(templates.prompt),
    referenceVisualAssetsSection(templates.asset),
  ];
}

function referencePatternsSection(entries: TemplateRef[]): PromptSection {
  if (entries.length === 0) return { heading: "", body: "" };
  const body = entries
    .map((t) => {
      const tail = t.notes ? ` · ${t.notes}` : "";
      return `- ${t.name}${tail}:\n  ${t.content.trim()}`;
    })
    .join("\n\n");
  return {
    heading:
      "Reference patterns (optional — imitate structure, don't copy verbatim; never override Brand or Event rules)",
    body,
  };
}

function reusableCtaSection(entries: TemplateRef[]): PromptSection {
  if (entries.length === 0) return { heading: "", body: "" };
  const body = entries.map((t) => `- ${t.content.trim()}`).join("\n");
  return {
    heading:
      "Reusable CTA examples (optional — reference for CTA style; final CTA must still match the Brand's CTA style)",
    body,
  };
}

function reusableBannerSection(entries: TemplateRef[]): PromptSection {
  if (entries.length === 0) return { heading: "", body: "" };
  const body = entries.map((t) => `- ${t.content.trim()}`).join("\n");
  return {
    heading:
      "Reusable banner examples (optional — short overlay-text patterns)",
    body,
  };
}

function referencePromptScaffoldsSection(entries: TemplateRef[]): PromptSection {
  if (entries.length === 0) return { heading: "", body: "" };
  const body = entries
    .map((t) => `- ${t.name}:\n  ${t.content.trim()}`)
    .join("\n\n");
  return {
    heading:
      "Reference prompt scaffolds (optional — structural cues for the image_prompt field)",
    body,
  };
}

function referenceVisualAssetsSection(entries: ReferenceAssetRef[]): PromptSection {
  if (entries.length === 0) return { heading: "", body: "" };
  const body = entries
    .map((a) => {
      const tail = a.notes ? ` · ${a.notes}` : "";
      return `- ${a.name} [${a.asset_type}] — ${a.url}${tail}`;
    })
    .join("\n");
  return {
    heading:
      "Reference visual assets (optional — mention descriptively in image_prompt where relevant; do not fabricate URLs)",
    body,
  };
}
