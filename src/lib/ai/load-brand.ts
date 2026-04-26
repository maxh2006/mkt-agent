import { db } from "@/lib/db";
import {
  DEFAULT_DESIGN_SETTINGS,
  DEFAULT_VOICE_SETTINGS,
  type DesignSettings,
  type SampleCaption,
  type VoiceSettings,
} from "@/lib/validations/brand";
import { coerceBrandVisualDefaults } from "@/lib/ai/visual/validation";
import type { BrandContext } from "./types";

/**
 * Server-side helper that loads a Brand row and lifts its JSON blobs into
 * the BrandContext shape the AI generator consumes. Mirrors the client-
 * side coercions used in the brands page so behavior stays in sync.
 *
 * If the brand is missing or inactive this returns null — callers decide
 * whether that's a 404 or a silent skip. `brandOr404()` is the common
 * shorthand.
 */
export async function loadBrandContext(
  brandId: string,
): Promise<BrandContext | null> {
  const b = await db.brand.findFirst({
    where: { id: brandId, active: true },
    select: {
      id: true,
      name: true,
      domain: true,
      primary_color: true,
      secondary_color: true,
      accent_color: true,
      voice_settings_json: true,
      design_settings_json: true,
      sample_captions_json: true,
    },
  });
  if (!b) return null;

  return {
    id: b.id,
    name: b.name,
    domain: b.domain,
    primary_color: b.primary_color,
    secondary_color: b.secondary_color,
    accent_color: b.accent_color,
    voice: coerceVoice(b.voice_settings_json),
    design: coerceDesign(b.design_settings_json),
    sample_captions: coerceCaptions(b.sample_captions_json),
    visual_defaults: coerceBrandVisualDefaults(extractVisualDefaultsRaw(b.design_settings_json)),
  };
}

/**
 * Pulls the `visual_defaults` sub-object out of a raw `design_settings_json`
 * blob. Returns `null` (which `coerceBrandVisualDefaults` treats as
 * "use defaults") when the design block is missing, malformed, or has
 * no `visual_defaults` key. Brands created before the Simple Mode UI
 * shipped (2026-04-27) have no such key — they cleanly degrade to the
 * canonical defaults instead of crashing the pipeline.
 */
function extractVisualDefaultsRaw(designRaw: unknown): unknown {
  if (!designRaw || typeof designRaw !== "object") return null;
  const r = designRaw as Record<string, unknown>;
  return r.visual_defaults ?? null;
}

export async function brandOr404(brandId: string): Promise<BrandContext> {
  const ctx = await loadBrandContext(brandId);
  if (!ctx) throw new Error(`Brand not found or inactive: ${brandId}`);
  return ctx;
}

// ─── Internals ──────────────────────────────────────────────────────────────

function coerceVoice(raw: unknown): VoiceSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_VOICE_SETTINGS };
  const r = raw as Record<string, unknown>;
  const legacyLanguage =
    typeof r.language_style === "string" ? r.language_style : "";

  return {
    positioning: String(r.positioning ?? ""),
    tone: (r.tone as VoiceSettings["tone"]) ?? DEFAULT_VOICE_SETTINGS.tone,
    cta_style:
      (r.cta_style as VoiceSettings["cta_style"]) ?? DEFAULT_VOICE_SETTINGS.cta_style,
    emoji_level:
      (r.emoji_level as VoiceSettings["emoji_level"]) ??
      DEFAULT_VOICE_SETTINGS.emoji_level,
    language_style: legacyLanguage,
    language_style_sample: String(r.language_style_sample ?? ""),
    audience_persona: String(r.audience_persona ?? ""),
    notes_for_ai: String(r.notes_for_ai ?? ""),
    banned_phrases: Array.isArray(r.banned_phrases) ? (r.banned_phrases as string[]) : [],
    banned_topics: Array.isArray(r.banned_topics) ? (r.banned_topics as string[]) : [],
    default_hashtags: Array.isArray(r.default_hashtags) ? (r.default_hashtags as string[]) : [],
  };
}

function coerceDesign(raw: unknown): DesignSettings | Record<string, unknown> {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DESIGN_SETTINGS };
  return raw as Record<string, unknown>;
}

function coerceCaptions(raw: unknown): SampleCaption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c, idx) => ({
      id: typeof c.id === "string" && c.id ? c.id : `legacy-${idx}`,
      title: typeof c.title === "string" ? c.title : "",
      type: typeof c.type === "string" ? c.type : undefined,
      text: typeof c.text === "string" ? c.text : "",
      notes: typeof c.notes === "string" ? c.notes : undefined,
    }));
}
