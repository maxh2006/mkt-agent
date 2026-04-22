import type { VoiceSettings } from "@/lib/validations/brand";
import type {
  BrandContext,
  EventOverride,
  EffectiveContext,
} from "./types";

/**
 * Merge Brand Management (base) with an optional Event brief (override)
 * into the single EffectiveContext the prompt builder consumes.
 *
 * Precedence rule (locked — see docs/06-workflows-roles.md "AI Context
 * Precedence"):
 *
 *   1. Brand Management is the default/base layer for every generation call.
 *   2. Event brief overrides brand fields ONLY when:
 *      - the post is event-derived, AND
 *      - the event field is set (non-null, non-empty string, non-empty array).
 *   3. If neither brand nor event has a value, the field is left empty.
 *
 * `overridden_by_event[]` records which fields the event won, so the
 * prompt builder can surface that reasoning explicitly.
 */
export function resolveEffectiveContext(
  brand: BrandContext,
  event: EventOverride | null,
): EffectiveContext {
  const voice = brand.voice;
  const overrides: string[] = [];

  const tone = pickString(event?.tone, voice.tone, overrides, "tone");
  const cta_style_raw = pickString(event?.cta, voice.cta_style, overrides, "cta_style");
  const audience_persona = pickString(
    event?.target_audience,
    voice.audience_persona,
    overrides,
    "audience_persona",
  );
  const notes_for_ai = mergeNotes(voice.notes_for_ai, event?.notes_for_ai, overrides);

  return {
    // Positioning always comes from the brand — events don't override
    // the core brand positioning statement.
    positioning: voice.positioning ?? "",
    tone,
    cta_style: cta_style_raw,
    emoji_level: voice.emoji_level ?? "",
    language_style: voice.language_style ?? "",
    language_style_sample: voice.language_style_sample ?? "",
    audience_persona,
    notes_for_ai,
    banned_phrases: toArray(voice.banned_phrases),
    banned_topics: toArray(voice.banned_topics),
    default_hashtags: toArray(voice.default_hashtags),
    overridden_by_event: overrides,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Prefer `eventValue` when it's a non-empty string; otherwise fall back
 * to `brandValue`. Records the override in `overrides[]`.
 */
function pickString(
  eventValue: string | null | undefined,
  brandValue: string | null | undefined,
  overrides: string[],
  fieldName: string,
): string {
  const ev = eventValue?.trim();
  if (ev) {
    // Only count as an override if brand actually had a value to be
    // overridden.  Otherwise it's just "event supplied", not "event won
    // a conflict" — but we still record it for transparency.
    overrides.push(fieldName);
    return ev;
  }
  return (brandValue ?? "").trim();
}

/**
 * Both brand.notes_for_ai and event.notes_for_ai are "nuance bucket"
 * free-text. We concatenate them rather than letting the event clobber
 * the brand entirely — the brand voice still matters even when the
 * event has extra guidance.
 */
function mergeNotes(
  brandNotes: string | null | undefined,
  eventNotes: string | null | undefined,
  overrides: string[],
): string {
  const b = (brandNotes ?? "").trim();
  const e = (eventNotes ?? "").trim();
  if (b && e) {
    overrides.push("notes_for_ai (appended)");
    return `${b}\n\nEvent-specific notes:\n${e}`;
  }
  if (e) {
    overrides.push("notes_for_ai");
    return e;
  }
  return b;
}

function toArray(v: VoiceSettings["banned_phrases"] | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}
