"use client";

import { cloneElement, useState, useId, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { brandsApi, type Brand } from "@/lib/brands-api";
import {
  DEFAULT_INTEGRATION_SETTINGS,
  DEFAULT_VOICE_SETTINGS,
  DEFAULT_DESIGN_SETTINGS,
  TONES, TONE_LABELS,
  CTA_STYLES, CTA_STYLE_LABELS,
  EMOJI_LEVELS, EMOJI_LEVEL_LABELS,
  VISUAL_STYLES, VISUAL_STYLE_LABELS,
  VISUAL_EMPHASES, VISUAL_EMPHASIS_LABELS,
  MAIN_SUBJECT_TYPES, MAIN_SUBJECT_TYPE_LABELS,
  LAYOUT_FAMILIES, LAYOUT_FAMILY_LABELS,
  PLATFORM_FORMATS, PLATFORM_FORMAT_LABELS,
  type IntegrationSettings,
  type VoiceSettings,
  type DesignSettings,
  type SampleCaption,
  type BenchmarkAsset,
  type BrandLogos,
  type BrandVisualDefaultsInput,
} from "@/lib/validations/brand";
import { DEFAULT_BRAND_VISUAL_DEFAULTS } from "@/lib/ai/visual/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Globe, Plug, Palette, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LogoUploadZone,
  LogoUploadConstraints,
  LOGO_SLOTS,
} from "@/components/brands/logo-upload-zone";
import { BenchmarkAssets } from "@/components/brands/benchmark-assets";
import { BrandMultiselect } from "@/components/brands/brand-multiselect";

// ─── Permission ───────────────────────────────────────────────────────────────

function isAdmin(role?: string) {
  return role === "admin";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Read-tolerant coercions: accept old shape (logo_url top-level,
// taglish_ratio, big_win_endpoint, hot_games_endpoint, generic `notes`)
// and map it onto the new shape so existing brands continue to open.

function coerceIntegration(raw: unknown): IntegrationSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_INTEGRATION_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    integration_enabled: Boolean(r.integration_enabled ?? false),
    api_base_url: String(r.api_base_url ?? ""),
    external_brand_code: String(r.external_brand_code ?? ""),
    promo_list_endpoint: String(r.promo_list_endpoint ?? ""),
    tracking_link_base: String(r.tracking_link_base ?? ""),
    source_mapping_notes: String(r.source_mapping_notes ?? r.notes ?? ""),
  };
}

function coerceVoice(raw: unknown): VoiceSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_VOICE_SETTINGS };
  const r = raw as Record<string, unknown>;

  // Legacy: language_style used to be an enum. Keep whatever string is
  // there; operator can refine to the new freeform format on first save.
  const legacyLanguage = typeof r.language_style === "string" ? r.language_style : "";

  return {
    positioning: String(r.positioning ?? ""),
    tone: (r.tone as VoiceSettings["tone"]) ?? DEFAULT_VOICE_SETTINGS.tone,
    cta_style: (r.cta_style as VoiceSettings["cta_style"]) ?? DEFAULT_VOICE_SETTINGS.cta_style,
    emoji_level: (r.emoji_level as VoiceSettings["emoji_level"]) ?? DEFAULT_VOICE_SETTINGS.emoji_level,
    language_style: legacyLanguage,
    language_style_sample: String(r.language_style_sample ?? ""),
    audience_persona: String(r.audience_persona ?? ""),
    notes_for_ai: String(r.notes_for_ai ?? ""),
    banned_phrases: Array.isArray(r.banned_phrases) ? (r.banned_phrases as string[]) : [],
    banned_topics: Array.isArray(r.banned_topics) ? (r.banned_topics as string[]) : [],
    default_hashtags: Array.isArray(r.default_hashtags) ? (r.default_hashtags as string[]) : [],
  };
}

interface DesignFormState {
  design_theme_notes: string;
  preferred_visual_style: string;
  headline_style: string;
  button_style: string;
  promo_text_style: string;
  color_usage_notes: string;
  logos: { main: string; square: string; horizontal: string; vertical: string };
  benchmark_assets: BenchmarkAsset[];
  visual_defaults: BrandVisualDefaultsInput;
}

// Tolerant per-field reader for the structured visual_defaults block.
// Falls back to DEFAULT_BRAND_VISUAL_DEFAULTS for any value that is missing
// or not a member of the canonical enum — guarantees the form always has a
// valid shape even when reading legacy JSON.
function coerceVisualDefaults(raw: unknown): BrandVisualDefaultsInput {
  const r = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const inEnum = <T extends readonly string[]>(v: unknown, enumVals: T): v is T[number] =>
    typeof v === "string" && (enumVals as readonly string[]).includes(v);

  const negs = Array.isArray(r.negative_visual_elements)
    ? (r.negative_visual_elements as unknown[])
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim())
    : [];
  const notes = typeof r.visual_notes === "string" ? r.visual_notes.trim() : "";

  return {
    visual_style: inEnum(r.visual_style, VISUAL_STYLES)
      ? r.visual_style
      : DEFAULT_BRAND_VISUAL_DEFAULTS.visual_style,
    visual_emphasis: inEnum(r.visual_emphasis, VISUAL_EMPHASES)
      ? r.visual_emphasis
      : DEFAULT_BRAND_VISUAL_DEFAULTS.visual_emphasis,
    main_subject_type: inEnum(r.main_subject_type, MAIN_SUBJECT_TYPES)
      ? r.main_subject_type
      : DEFAULT_BRAND_VISUAL_DEFAULTS.main_subject_type,
    layout_family: inEnum(r.layout_family, LAYOUT_FAMILIES)
      ? r.layout_family
      : DEFAULT_BRAND_VISUAL_DEFAULTS.layout_family,
    platform_format_default: inEnum(r.platform_format_default, PLATFORM_FORMATS)
      ? r.platform_format_default
      : DEFAULT_BRAND_VISUAL_DEFAULTS.platform_format_default,
    negative_visual_elements: negs,
    ...(notes ? { visual_notes: notes } : {}),
  };
}

function coerceDesign(raw: unknown, legacyLogoUrl: string | null): DesignFormState {
  const r = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const rawLogos = (r.logos && typeof r.logos === "object") ? (r.logos as Record<string, unknown>) : {};
  // One-way migration: surface the legacy top-level logo_url column as
  // design.logos.main if that slot isn't already filled.
  const mainFromLogos = String(rawLogos.main ?? "");
  const mergedMain = mainFromLogos || legacyLogoUrl || "";

  const assetsRaw = Array.isArray(r.benchmark_assets) ? (r.benchmark_assets as Array<Record<string, unknown>>) : [];
  const benchmark_assets: BenchmarkAsset[] = assetsRaw
    .filter((a) => typeof a.url === "string" && a.url.trim().length > 0)
    .map((a, idx) => ({
      id: typeof a.id === "string" && a.id ? a.id : `legacy-${idx}`,
      url: String(a.url),
      label: typeof a.label === "string" ? a.label : "",
      notes: typeof a.notes === "string" ? a.notes : "",
    }));

  return {
    design_theme_notes: String(r.design_theme_notes ?? ""),
    preferred_visual_style: String(r.preferred_visual_style ?? ""),
    headline_style: String(r.headline_style ?? ""),
    button_style: String(r.button_style ?? ""),
    promo_text_style: String(r.promo_text_style ?? ""),
    color_usage_notes: String(r.color_usage_notes ?? ""),
    logos: {
      main: mergedMain,
      square: String(rawLogos.square ?? ""),
      horizontal: String(rawLogos.horizontal ?? ""),
      vertical: String(rawLogos.vertical ?? ""),
    },
    benchmark_assets,
    visual_defaults: coerceVisualDefaults(r.visual_defaults),
  };
}

function coerceCaptions(raw: unknown): SampleCaption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c, idx) => ({
      id: typeof c.id === "string" && c.id ? c.id : `legacy-${idx}`,
      title: typeof c.title === "string" ? c.title : "",
      type: typeof c.type === "string" ? c.type : "",
      text: typeof c.text === "string" ? c.text : "",
      notes: typeof c.notes === "string" ? c.notes : "",
    }));
}

// Turn a form-state DesignFormState (all strings) into the on-wire shape
// for the API. Empty strings become undefined so the AI prompt builder
// doesn't receive meaningless blanks.
function designToPayload(d: DesignFormState): DesignSettings {
  const logos: BrandLogos = {};
  if (d.logos.main.trim()) logos.main = d.logos.main.trim();
  if (d.logos.square.trim()) logos.square = d.logos.square.trim();
  if (d.logos.horizontal.trim()) logos.horizontal = d.logos.horizontal.trim();
  if (d.logos.vertical.trim()) logos.vertical = d.logos.vertical.trim();

  const strOrUndef = (s: string) => (s.trim() ? s.trim() : undefined);
  const cleanedAssets = d.benchmark_assets
    .filter((a) => a.url.trim().length > 0)
    .map((a) => ({
      id: a.id,
      url: a.url.trim(),
      label: strOrUndef(a.label ?? ""),
      notes: strOrUndef(a.notes ?? ""),
    }));

  // Always emit visual_defaults — the form seeds DEFAULT_BRAND_VISUAL_DEFAULTS
  // when the brand has no block yet, so this is always a valid shape. Trim
  // negative_visual_elements + drop empties; treat blank visual_notes as absent
  // so the compiler skips the optional brand-note section cleanly.
  const cleanNegatives = (d.visual_defaults.negative_visual_elements ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const trimmedNotes = (d.visual_defaults.visual_notes ?? "").trim();
  const visual_defaults: BrandVisualDefaultsInput = {
    visual_style: d.visual_defaults.visual_style,
    visual_emphasis: d.visual_defaults.visual_emphasis,
    main_subject_type: d.visual_defaults.main_subject_type,
    layout_family: d.visual_defaults.layout_family,
    platform_format_default: d.visual_defaults.platform_format_default,
    negative_visual_elements: cleanNegatives,
    ...(trimmedNotes ? { visual_notes: trimmedNotes } : {}),
  };

  return {
    design_theme_notes: strOrUndef(d.design_theme_notes),
    preferred_visual_style: strOrUndef(d.preferred_visual_style),
    headline_style: strOrUndef(d.headline_style),
    button_style: strOrUndef(d.button_style),
    promo_text_style: strOrUndef(d.promo_text_style),
    color_usage_notes: strOrUndef(d.color_usage_notes),
    logos: Object.keys(logos).length > 0 ? logos : undefined,
    benchmark_assets: cleanedAssets.length > 0 ? cleanedAssets : undefined,
    visual_defaults,
  };
}

function integrationToPayload(i: IntegrationSettings): IntegrationSettings {
  const strOrUndef = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
  return {
    integration_enabled: i.integration_enabled,
    api_base_url: strOrUndef(i.api_base_url),
    external_brand_code: strOrUndef(i.external_brand_code),
    promo_list_endpoint: strOrUndef(i.promo_list_endpoint),
    tracking_link_base: strOrUndef(i.tracking_link_base),
    source_mapping_notes: strOrUndef(i.source_mapping_notes),
  };
}

// ─── Small shared UI pieces ───────────────────────────────────────────────────

function FieldLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-sm font-medium">
        {children}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50";
const textareaCls = inputCls + " resize-none";

function ColorSwatch({ color }: { color: string | null }) {
  if (!color) return <div className="h-5 w-5 rounded-full border bg-muted" />;
  return (
    <div
      className="h-5 w-5 rounded-full border"
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function IntegrationBadge({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
      <Plug className="h-3 w-3" />
      Integrated
    </span>
  );
}

// ─── Tag input (banned phrases / banned topics / default hashtags) ────────────

function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed || value.includes(trimmed)) { setDraft(""); return; }
    onChange([...value, trimmed]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={cn(inputCls, "flex-1")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={disabled}>
          Add
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs"
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((t) => t !== tag))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Color field with native color picker ─────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
        />
        <input
          className={cn(inputCls, "flex-1 font-mono uppercase")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

type TabId = "identity" | "integration" | "voice" | "design" | "captions";

interface FormState {
  name: string;
  domain: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  active: boolean;
  integration: IntegrationSettings;
  voice: VoiceSettings;
  design: DesignFormState;
  captions: SampleCaption[];
}

function emptyForm(): FormState {
  return {
    name: "",
    domain: "",
    primary_color: "",
    secondary_color: "",
    accent_color: "",
    active: true,
    integration: { ...DEFAULT_INTEGRATION_SETTINGS },
    voice: { ...DEFAULT_VOICE_SETTINGS },
    design: {
      design_theme_notes: "",
      preferred_visual_style: "",
      headline_style: "",
      button_style: "",
      promo_text_style: "",
      color_usage_notes: "",
      logos: { main: "", square: "", horizontal: "", vertical: "" },
      benchmark_assets: [],
      visual_defaults: { ...DEFAULT_BRAND_VISUAL_DEFAULTS },
    },
    captions: [],
  };
}

function brandToForm(b: Brand): FormState {
  return {
    name: b.name,
    domain: b.domain ?? "",
    primary_color: b.primary_color ?? "",
    secondary_color: b.secondary_color ?? "",
    accent_color: b.accent_color ?? "",
    active: b.active,
    integration: coerceIntegration(b.integration_settings_json),
    voice: coerceVoice(b.voice_settings_json),
    design: coerceDesign(b.design_settings_json, b.logo_url),
    captions: coerceCaptions(b.sample_captions_json),
  };
}

// ─── Brand form dialog ────────────────────────────────────────────────────────

function BrandFormDialog({
  brand,
  onSaved,
  trigger,
}: {
  brand?: Brand;
  onSaved: () => void;
  trigger: React.ReactElement<{ onClick?: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("identity");
  const [form, setForm] = useState<FormState>(brand ? brandToForm(brand) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  function openDialog() {
    setForm(brand ? brandToForm(brand) : emptyForm());
    setTab("identity");
    setError(null);
    setOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setIntegration<K extends keyof IntegrationSettings>(key: K, value: IntegrationSettings[K]) {
    setForm((f) => ({ ...f, integration: { ...f.integration, [key]: value } }));
  }

  function setVoice<K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) {
    setForm((f) => ({ ...f, voice: { ...f.voice, [key]: value } }));
  }

  function setDesignText<K extends keyof Omit<DesignFormState, "logos" | "benchmark_assets">>(key: K, value: string) {
    setForm((f) => ({ ...f, design: { ...f.design, [key]: value } }));
  }

  function setLogo(key: keyof DesignFormState["logos"], value: string) {
    setForm((f) => ({
      ...f,
      design: { ...f.design, logos: { ...f.design.logos, [key]: value } },
    }));
  }

  function setBenchmarkAssets(value: BenchmarkAsset[]) {
    setForm((f) => ({ ...f, design: { ...f.design, benchmark_assets: value } }));
  }

  function setVisualDefault<K extends keyof BrandVisualDefaultsInput>(
    key: K,
    value: BrandVisualDefaultsInput[K],
  ) {
    setForm((f) => ({
      ...f,
      design: {
        ...f.design,
        visual_defaults: { ...f.design.visual_defaults, [key]: value },
      },
    }));
  }

  // Sample captions helpers
  function addCaption() {
    setForm((f) => ({
      ...f,
      captions: [
        ...f.captions,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: "",
          type: "",
          text: "",
          notes: "",
        },
      ],
    }));
  }

  function updateCaption(idx: number, key: keyof SampleCaption, value: string) {
    setForm((f) => {
      const captions = [...f.captions];
      captions[idx] = { ...captions[idx], [key]: value };
      return { ...f, captions };
    });
  }

  function removeCaption(idx: number) {
    setForm((f) => ({ ...f, captions: f.captions.filter((_, i) => i !== idx) }));
  }

  function cloneCaption(idx: number) {
    setForm((f) => {
      const src = f.captions[idx];
      if (!src) return f;
      return {
        ...f,
        captions: [
          ...f.captions,
          {
            ...src,
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: src.title ? `${src.title} (copy)` : "",
          },
        ],
      };
    });
  }

  // Validation — surface the first violation and jump to its tab.
  function validateAndJump(): string | null {
    const v = form;
    // Identity
    if (!v.name.trim()) { setTab("identity"); return "Brand name is required"; }
    if (!v.domain.trim()) { setTab("identity"); return "Domain is required"; }
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    if (!hexRe.test(v.primary_color)) { setTab("identity"); return "Primary color must be a hex (e.g. #FF0000)"; }
    if (!hexRe.test(v.secondary_color)) { setTab("identity"); return "Secondary color must be a hex"; }
    if (!hexRe.test(v.accent_color)) { setTab("identity"); return "Accent color must be a hex"; }
    const positioning = v.voice.positioning.trim();
    if (positioning.length < 50) { setTab("identity"); return "Brand Positioning Statement must be at least 50 characters"; }
    if (positioning.length > 200) { setTab("identity"); return "Brand Positioning Statement must be at most 200 characters"; }
    // Voice
    if (!v.voice.tone) { setTab("voice"); return "Tone is required"; }
    if (!v.voice.cta_style) { setTab("voice"); return "CTA Style is required"; }
    if (!v.voice.emoji_level) { setTab("voice"); return "Emoji Level is required"; }
    if (!v.voice.language_style.trim()) { setTab("voice"); return "Language Style is required"; }
    if (!v.voice.language_style_sample.trim()) { setTab("voice"); return "Language Style Sample is required"; }
    if (!v.voice.audience_persona.trim()) { setTab("voice"); return "Audience Persona is required"; }
    if (!v.voice.notes_for_ai.trim()) { setTab("voice"); return "Notes for AI is required"; }
    // Captions — title required when caption exists
    for (let i = 0; i < v.captions.length; i++) {
      const c = v.captions[i];
      if (!c.title?.trim()) { setTab("captions"); return `Sample caption ${i + 1}: title is required`; }
      if (!c.text.trim()) { setTab("captions"); return `Sample caption ${i + 1}: caption text is required`; }
    }
    return null;
  }

  async function handleSave() {
    const problem = validateAndJump();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        identity: {
          name: form.name.trim(),
          domain: form.domain.trim(),
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          active: form.active,
        },
        integration: integrationToPayload(form.integration),
        voice: {
          ...form.voice,
          positioning: form.voice.positioning.trim(),
          language_style: form.voice.language_style.trim(),
          language_style_sample: form.voice.language_style_sample.trim(),
          audience_persona: form.voice.audience_persona.trim(),
          notes_for_ai: form.voice.notes_for_ai.trim(),
        },
        design: designToPayload(form.design),
        sample_captions: form.captions.map((c) => ({
          ...c,
          title: (c.title ?? "").trim(),
          text: c.text.trim(),
          type: c.type?.trim() || undefined,
          notes: c.notes?.trim() || undefined,
        })),
      };
      if (brand) {
        await brandsApi.update(brand.id, payload);
      } else {
        await brandsApi.create(payload);
      }
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save brand");
    } finally {
      setSaving(false);
    }
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: "identity", label: "Identity" },
    { id: "integration", label: "Integration" },
    { id: "voice", label: "Voice & Tone" },
    { id: "design", label: "Design" },
    { id: "captions", label: "Sample Captions" },
  ];

  const voiceDropdowns = [
    { key: "tone" as const, label: "Tone", options: TONES, labels: TONE_LABELS },
    { key: "cta_style" as const, label: "CTA Style", options: CTA_STYLES, labels: CTA_STYLE_LABELS },
    { key: "emoji_level" as const, label: "Emoji Level", options: EMOJI_LEVELS, labels: EMOJI_LEVEL_LABELS },
  ];

  const positioningLen = form.voice.positioning.trim().length;

  return (
    <>
      {/* Trigger rendered outside Dialog to avoid nested-button issues (Base UI) */}
      {cloneElement(trigger, { onClick: openDialog })}

      <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{brand ? `Edit — ${brand.name}` : "Add Brand"}</DialogTitle>
          </DialogHeader>

          {/* AI precedence note */}
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground shrink-0">
            These settings form the <span className="font-medium text-foreground">base AI profile</span> for this brand. Adhoc Event briefs override brand rules on conflict.
          </div>

          {/* Tab bar */}
          <div className="flex gap-0.5 border-b overflow-x-auto shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                  tab === t.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 p-1 py-3">

              {/* ── A. Identity ── */}
              {tab === "identity" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <FieldLabel required>Brand Name</FieldLabel>
                      <input
                        className={inputCls}
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        placeholder="e.g. Lucky Casino"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel required>Domain</FieldLabel>
                      <input
                        className={inputCls}
                        value={form.domain}
                        onChange={(e) => set("domain", e.target.value)}
                        placeholder="e.g. luckycasino.com"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <FieldLabel
                      required
                      hint="Single-sentence positioning anchor used as the default rule for every AI generation call. 50–200 characters."
                    >
                      Brand Positioning Statement
                    </FieldLabel>
                    <textarea
                      className={textareaCls}
                      rows={2}
                      value={form.voice.positioning}
                      onChange={(e) => setVoice("positioning", e.target.value)}
                      placeholder="e.g. Premium gaming platform for millennials"
                      disabled={saving}
                    />
                    <p className={cn(
                      "text-xs",
                      positioningLen > 0 && (positioningLen < 50 || positioningLen > 200)
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}>
                      {positioningLen} / 200 characters {positioningLen > 0 && positioningLen < 50 && "(min 50)"}
                    </p>
                  </div>

                  {/* Logos */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Logos</p>
                      <p className="text-xs text-muted-foreground">
                        Upload four logo formats so the AI can pick the right layout per placement.
                      </p>
                    </div>
                    <LogoUploadConstraints />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {LOGO_SLOTS.map((slot) => (
                        <LogoUploadZone
                          key={slot.key}
                          label={slot.label}
                          helperText={slot.helper}
                          value={form.design.logos[slot.key]}
                          onChange={(url) => setLogo(slot.key, url)}
                          disabled={saving}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Brand Colors</p>
                        <p className="text-xs text-muted-foreground">
                          Define brand identity, the design tone of generated images, and CTA / emphasis / layout accents.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <ColorField label="Primary" required value={form.primary_color} onChange={(v) => set("primary_color", v)} disabled={saving} />
                      <ColorField label="Secondary" required value={form.secondary_color} onChange={(v) => set("secondary_color", v)} disabled={saving} />
                      <ColorField label="Accent" required value={form.accent_color} onChange={(v) => set("accent_color", v)} disabled={saving} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) => set("active", e.target.checked)}
                        disabled={saving}
                        className="h-4 w-4 rounded"
                        id={`${uid}-active`}
                      />
                      Active brand
                    </label>
                    <span className="text-xs text-muted-foreground">
                      Inactive brands are hidden from the brand switcher.
                    </span>
                  </div>
                </div>
              )}

              {/* ── B. Integration ── */}
              {tab === "integration" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={form.integration.integration_enabled}
                        onChange={(e) => setIntegration("integration_enabled", e.target.checked)}
                        disabled={saving}
                        className="h-4 w-4 rounded"
                      />
                      Integration enabled
                    </label>
                  </div>

                  {/* BigQuery callout */}
                  <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 space-y-1">
                    <p className="text-sm font-medium">BigQuery Details</p>
                    <p className="text-xs text-muted-foreground">
                      Big Wins and Hot Games read from the <span className="font-medium">shared global BigQuery dataset</span>.
                      The fields here are brand-level mapping/reference only — not a per-brand BigQuery setup.
                    </p>
                    <div className="pt-1 space-y-3">
                      <div className="space-y-1">
                        <FieldLabel hint="How this brand appears in the shared dataset (e.g. brand_id value, slug, or code). Optional.">
                          External Brand ID / Source Brand Code
                        </FieldLabel>
                        <input
                          className={inputCls}
                          value={form.integration.external_brand_code ?? ""}
                          onChange={(e) => setIntegration("external_brand_code", e.target.value)}
                          placeholder="e.g. LUCKY01"
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel hint="Internal mapping notes — any quirks of how this brand's rows appear in the shared dataset. Optional.">
                          Source Mapping Notes
                        </FieldLabel>
                        <textarea
                          className={textareaCls}
                          rows={2}
                          value={form.integration.source_mapping_notes ?? ""}
                          onChange={(e) => setIntegration("source_mapping_notes", e.target.value)}
                          placeholder="e.g. Uses legacy brand_id 7 in shared.users; username handle lives in display_name."
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>

                  {/* API callout */}
                  <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 space-y-1">
                    <p className="text-sm font-medium">API Details</p>
                    <p className="text-xs text-muted-foreground">
                      Running Promotions are fetched per brand from the brand&apos;s own API.
                    </p>
                    <div className="pt-1 space-y-3">
                      <div className="space-y-1">
                        <FieldLabel>API Base URL</FieldLabel>
                        <input
                          className={inputCls}
                          value={form.integration.api_base_url ?? ""}
                          onChange={(e) => setIntegration("api_base_url", e.target.value)}
                          placeholder="https://api.luckycasino.com"
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel>Promo List Endpoint</FieldLabel>
                        <input
                          className={inputCls}
                          value={form.integration.promo_list_endpoint ?? ""}
                          onChange={(e) => setIntegration("promo_list_endpoint", e.target.value)}
                          placeholder="/v1/promotions"
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel hint="Base URL used when generating trackable links in posted content.">
                          Tracking Link Base URL
                        </FieldLabel>
                        <input
                          className={inputCls}
                          value={form.integration.tracking_link_base ?? ""}
                          onChange={(e) => setIntegration("tracking_link_base", e.target.value)}
                          placeholder="https://track.luckycasino.com"
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── C. Voice & Tone ── */}
              {tab === "voice" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {voiceDropdowns.map(({ key, label, options, labels }) => (
                      <div key={key} className="space-y-1">
                        <FieldLabel required>{label}</FieldLabel>
                        <Select
                          value={(form.voice[key] as string) ?? ""}
                          onValueChange={(v) => setVoice(key, v as VoiceSettings[typeof key])}
                          disabled={saving}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(options as readonly string[]).map((o) => (
                              <SelectItem key={o} value={o}>
                                {labels[o]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <FieldLabel
                        required
                        hint="How this brand speaks. Free-form: describe the exact mix you want."
                      >
                        Language Style
                      </FieldLabel>
                      <input
                        className={inputCls}
                        value={form.voice.language_style}
                        onChange={(e) => setVoice("language_style", e.target.value)}
                        placeholder="e.g. Casual Taglish; or: English only"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel
                        required
                        hint="Write one sentence in your preferred language style. The AI will imitate it."
                      >
                        Language Style Sample
                      </FieldLabel>
                      <textarea
                        className={textareaCls}
                        rows={2}
                        value={form.voice.language_style_sample}
                        onChange={(e) => setVoice("language_style_sample", e.target.value)}
                        placeholder="e.g. Swipe mo na lang — sulit ang deposit mo today!"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <FieldLabel
                      required
                      hint="Who are we talking to? Age range, lifestyle, gaming habits — AI uses this to calibrate tone."
                    >
                      Audience Persona
                    </FieldLabel>
                    <textarea
                      className={textareaCls}
                      rows={3}
                      value={form.voice.audience_persona}
                      onChange={(e) => setVoice("audience_persona", e.target.value)}
                      placeholder="e.g. Age 25–35, urban professionals, price-conscious, familiar with online gaming."
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1">
                    <FieldLabel
                      required
                      hint="Nuance bucket. Guidance that doesn't fit the structured fields above — tone reminders, dos, don'ts, brand-specific voice notes."
                    >
                      Notes for AI
                    </FieldLabel>
                    <textarea
                      className={textareaCls}
                      rows={4}
                      value={form.voice.notes_for_ai}
                      onChange={(e) => setVoice("notes_for_ai", e.target.value)}
                      placeholder={[
                        "e.g.",
                        "- Avoid sounding too salesy",
                        "- Emphasize trust and simplicity",
                        "- Keep tone premium but friendly",
                        "- Never overhype",
                      ].join("\n")}
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1">
                    <FieldLabel hint="Specific words and phrases to avoid in generated content.">
                      Banned Phrases
                    </FieldLabel>
                    <TagInput
                      value={form.voice.banned_phrases ?? []}
                      onChange={(v) => setVoice("banned_phrases", v)}
                      placeholder="e.g. guaranteed, get rich quick"
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1">
                    <FieldLabel hint="Category-level guardrails. Broader than banned phrases — e.g. a whole topic the AI should never touch.">
                      Banned Topics
                    </FieldLabel>
                    <TagInput
                      value={form.voice.banned_topics ?? []}
                      onChange={(v) => setVoice("banned_topics", v)}
                      placeholder="e.g. political content, religion, explicit content"
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1">
                    <FieldLabel hint="Hashtags appended by default on generated posts. Include the # prefix.">
                      Default Hashtags
                    </FieldLabel>
                    <TagInput
                      value={form.voice.default_hashtags ?? []}
                      onChange={(v) => setVoice("default_hashtags", v)}
                      placeholder="e.g. #LuckyCasino #DailyPromos #Jackpot"
                      disabled={saving}
                    />
                  </div>
                </div>
              )}

              {/* ── D. Design ── */}
              {tab === "design" && (
                <div className="space-y-6">
                  {/* Framing — visual rule precedence */}
                  <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    These settings define the <span className="font-medium text-foreground">default visual style</span> this brand prefers. Event-level visual settings can override them when needed. The AI image model uses these to compose backgrounds; final text + logos are rendered as a deterministic overlay.
                  </div>

                  {/* ── Simple Mode — structured visual defaults (primary path) ── */}
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-medium">Visual Defaults</p>
                      <p className="text-xs text-muted-foreground">
                        Pick from structured options — operators don&apos;t author detailed visual prompts.
                      </p>
                    </div>

                    {[
                      {
                        key: "visual_style" as const,
                        label: "Visual Style",
                        hint: "Overall art language. No Event override — stays brand-level for consistency across the brand's events.",
                        options: VISUAL_STYLES,
                        labels: VISUAL_STYLE_LABELS as Record<string, string>,
                      },
                      {
                        key: "visual_emphasis" as const,
                        label: "Visual Emphasis",
                        hint: "What the visual should make hero by default.",
                        options: VISUAL_EMPHASES,
                        labels: VISUAL_EMPHASIS_LABELS as Record<string, string>,
                      },
                      {
                        key: "main_subject_type" as const,
                        label: "Main Subject Type",
                        hint: "Preferred subject family. Source facts (e.g. Big Win) can imply a stronger subject at generation time.",
                        options: MAIN_SUBJECT_TYPES,
                        labels: MAIN_SUBJECT_TYPE_LABELS as Record<string, string>,
                      },
                      {
                        key: "layout_family" as const,
                        label: "Layout Family",
                        hint: "Where text + logo + subject sit on the canvas. The compiler falls back to a platform-friendly layout if this one doesn't fit the target format.",
                        options: LAYOUT_FAMILIES,
                        labels: LAYOUT_FAMILY_LABELS as Record<string, string>,
                      },
                      {
                        key: "platform_format_default" as const,
                        label: "Default Platform Format",
                        hint: "Used only when neither Event nor the target platform's natural orientation dictates one.",
                        options: PLATFORM_FORMATS,
                        labels: PLATFORM_FORMAT_LABELS as Record<string, string>,
                      },
                    ].map(({ key, label, hint, options, labels }) => (
                      <div key={key} className="space-y-1">
                        <FieldLabel required hint={hint}>{label}</FieldLabel>
                        <Select
                          value={form.design.visual_defaults[key] as string}
                          onValueChange={(v) =>
                            setVisualDefault(key, v as BrandVisualDefaultsInput[typeof key])
                          }
                          disabled={saving}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {labels[opt]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}

                    <div className="space-y-1">
                      <FieldLabel hint="Things this brand should NEVER show. Enforced as a negative prompt at generation time. Up to 20 entries.">
                        Negative Visual Elements
                      </FieldLabel>
                      <TagInput
                        value={form.design.visual_defaults.negative_visual_elements ?? []}
                        onChange={(v) => setVisualDefault("negative_visual_elements", v)}
                        placeholder="e.g. cartoon characters, alcohol, blurry textures"
                        disabled={saving}
                      />
                    </div>

                    <div className="space-y-1">
                      <FieldLabel hint="Optional short stylistic nudge — NOT a prompt. Max 200 characters.">
                        Visual Notes <span className="text-muted-foreground font-normal">(optional)</span>
                      </FieldLabel>
                      <textarea
                        className={textareaCls}
                        rows={2}
                        maxLength={200}
                        value={form.design.visual_defaults.visual_notes ?? ""}
                        onChange={(e) => setVisualDefault("visual_notes", e.target.value)}
                        placeholder="e.g. Lean editorial, never neon."
                        disabled={saving}
                      />
                      <p className="text-xs text-muted-foreground">
                        {(form.design.visual_defaults.visual_notes ?? "").length} / 200 characters
                      </p>
                    </div>
                  </div>

                  {/* ── Logos / Benchmark Assets ── */}
                  <div className="pt-3 border-t space-y-2">
                    <p className="text-sm font-medium">Benchmark Assets</p>
                    <p className="text-xs text-muted-foreground">
                      Upload reference banners, mascots, or recurring visual cues the AI can use as identity guidance.
                    </p>
                    <BenchmarkAssets
                      value={form.design.benchmark_assets}
                      onChange={setBenchmarkAssets}
                      disabled={saving}
                    />
                  </div>

                  {/* ── Legacy free-text design notes (deprecated) ── */}
                  <details className="pt-3 border-t group">
                    <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground select-none flex items-center gap-1.5">
                      <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                      Legacy design notes
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        deprecated
                      </span>
                    </summary>
                    <div className="mt-3 space-y-4 rounded-md border border-dashed border-border/60 bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">
                        These free-text fields predate the structured Visual Defaults above. They are kept readable + editable for now but are no longer the authoritative visual rule source — the AI generator reads <span className="font-medium text-foreground">Visual Defaults</span>. New brands should leave these blank.
                      </p>
                      {[
                        {
                          key: "design_theme_notes" as const,
                          label: "Design Theme Notes",
                          rows: 3,
                          placeholder: "e.g. Bold golds, gradient overlays, casino-night vibe. Avoid pastels.",
                        },
                        {
                          key: "preferred_visual_style" as const,
                          label: "Preferred Visual Style (legacy text)",
                          rows: 2,
                          placeholder: "Superseded by the Visual Style picker above.",
                        },
                        {
                          key: "headline_style" as const,
                          label: "Headline Style",
                          rows: 2,
                          placeholder: "e.g. All-caps, sentence case, with emoji prefix.",
                        },
                        {
                          key: "button_style" as const,
                          label: "Button / CTA Style",
                          rows: 2,
                          placeholder: "e.g. Rounded pill, bright yellow, uppercase text.",
                        },
                        {
                          key: "promo_text_style" as const,
                          label: "Promo Text Style",
                          rows: 2,
                          placeholder: "e.g. Short punchy lines. Highlight numbers in bold.",
                        },
                        {
                          key: "color_usage_notes" as const,
                          label: "Color Usage Notes",
                          rows: 3,
                          placeholder: "e.g. Primary on backgrounds; accent reserved for CTAs and win numbers.",
                        },
                      ].map(({ key, label, rows, placeholder }) => (
                        <div key={key} className="space-y-1">
                          <FieldLabel>{label}</FieldLabel>
                          <textarea
                            className={textareaCls}
                            rows={rows}
                            value={form.design[key]}
                            onChange={(e) => setDesignText(key, e.target.value)}
                            placeholder={placeholder}
                            disabled={saving}
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              {/* ── E. Sample Captions ── */}
              {tab === "captions" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Add reference captions that represent this brand&apos;s voice. Used as few-shot examples for AI generation.
                  </p>

                  {form.captions.length === 0 && (
                    <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                      No sample captions yet. Add one below.
                    </p>
                  )}

                  {form.captions.map((cap, idx) => (
                    <div key={cap.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Caption {idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => cloneCaption(idx)}
                            disabled={saving}
                            className="text-xs text-muted-foreground hover:text-foreground px-1.5"
                            title="Clone this caption"
                          >
                            Clone
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCaption(idx)}
                            disabled={saving}
                            className="text-muted-foreground hover:text-destructive"
                            title="Remove caption"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <FieldLabel required>Title</FieldLabel>
                          <input
                            className={inputCls}
                            value={cap.title ?? ""}
                            onChange={(e) => updateCaption(idx, "title", e.target.value)}
                            placeholder="e.g. Big Win post"
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-1">
                          <FieldLabel>Type</FieldLabel>
                          <input
                            className={inputCls}
                            value={cap.type ?? ""}
                            onChange={(e) => updateCaption(idx, "type", e.target.value)}
                            placeholder="e.g. promo, big_win, educational"
                            disabled={saving}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <FieldLabel required>Caption Text</FieldLabel>
                        <textarea
                          className={textareaCls}
                          rows={3}
                          value={cap.text}
                          onChange={(e) => updateCaption(idx, "text", e.target.value)}
                          placeholder="Write the example caption here…"
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel hint="Why this caption works — key elements used, tone cue, etc.">
                          Notes
                        </FieldLabel>
                        <input
                          className={inputCls}
                          value={cap.notes ?? ""}
                          onChange={(e) => updateCaption(idx, "notes", e.target.value)}
                          placeholder="e.g. Short CTA, single emoji, highlights prize amount"
                          disabled={saving}
                        />
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" size="sm" onClick={addCaption} disabled={saving}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Sample Caption
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-3 flex items-center justify-between gap-3 shrink-0">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : brand ? "Save Changes" : "Create Brand"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Brand card ───────────────────────────────────────────────────────────────

function BrandCard({
  brand,
  canEdit,
  onUpdated,
}: {
  brand: Brand;
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const integration = coerceIntegration(brand.integration_settings_json);
  const voice = coerceVoice(brand.voice_settings_json);

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card px-5 py-4">
      <div className="min-w-0 space-y-2 flex-1">
        {/* Name + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{brand.name}</p>
          <StatusBadge active={brand.active} />
          <IntegrationBadge enabled={integration.integration_enabled} />
        </div>

        {/* Positioning statement preview */}
        {voice.positioning && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {voice.positioning}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {brand.domain && (
            <span className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {brand.domain}
            </span>
          )}
          {integration.api_base_url && (
            <span className="flex items-center gap-1 truncate max-w-[220px]">
              <Plug className="h-3 w-3" />
              {integration.api_base_url}
            </span>
          )}
        </div>

        {/* Color swatches */}
        <div className="flex items-center gap-1.5">
          <Palette className="h-3 w-3 text-muted-foreground" />
          <ColorSwatch color={brand.primary_color} />
          <ColorSwatch color={brand.secondary_color} />
          <ColorSwatch color={brand.accent_color} />
          {!brand.primary_color && !brand.secondary_color && !brand.accent_color && (
            <span className="text-xs text-muted-foreground">No colors set</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Updated {formatDate(brand.updated_at)}
        </p>
      </div>

      {canEdit && (
        <BrandFormDialog
          brand={brand}
          onSaved={onUpdated}
          trigger={
            <Button variant="ghost" size="icon" title="Edit brand">
              <Pencil className="h-4 w-4" />
            </Button>
          }
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrandsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdmin(session?.user?.role);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "true" | "false">("all");
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);

  const { data: brands, isLoading, isError, error } = useQuery({
    queryKey: ["brands", search, statusFilter],
    queryFn: () =>
      brandsApi.list({
        search: search || undefined,
        active: statusFilter === "all" ? undefined : statusFilter,
      }),
    retry: false,
  });

  // Client-side multi-brand filter layered on top of server-filtered results.
  const visibleBrands = useMemo(() => {
    if (!brands) return [];
    if (selectedBrandIds.length === 0) return brands;
    const picked = new Set(selectedBrandIds);
    return brands.filter((b) => picked.has(b.id));
  }, [brands, selectedBrandIds]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["brands"] });
    // Keep topbar in sync: newly created/updated brands reflect immediately
    queryClient.invalidateQueries({ queryKey: ["brands-switcher"] });
    queryClient.invalidateQueries({ queryKey: ["active-brand"] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Brand Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage all brands. These settings form the base AI profile for each brand — adhoc event briefs override on conflict.
          </p>
        </div>
        {canEdit && (
          <BrandFormDialog
            onSaved={invalidate}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Brand
              </Button>
            }
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            placeholder="Search brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | "true" | "false")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status: All</SelectItem>
            <SelectItem value="true">Status: Active</SelectItem>
            <SelectItem value="false">Status: Inactive</SelectItem>
          </SelectContent>
        </Select>

        <BrandMultiselect
          brands={brands ?? []}
          selected={selectedBrandIds}
          onChange={setSelectedBrandIds}
          disabled={isLoading || !brands || brands.length === 0}
        />
      </div>

      {/* States */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load brands."}
        </div>
      )}

      {!isLoading && !isError && visibleBrands.length === 0 && (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {brands && brands.length > 0 && selectedBrandIds.length > 0
              ? "No brands match the current filter."
              : "No brands found."}
          </p>
          {canEdit && brands && brands.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Click &quot;Add Brand&quot; to create your first brand.
            </p>
          )}
        </div>
      )}

      {!isLoading && !isError && visibleBrands.length > 0 && (
        <div className="space-y-3">
          {visibleBrands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              canEdit={canEdit}
              onUpdated={invalidate}
            />
          ))}
          <p className="text-xs text-muted-foreground text-right">
            Showing {visibleBrands.length} of {brands?.length ?? 0} brand{(brands?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
