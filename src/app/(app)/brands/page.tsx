"use client";

import { cloneElement, useState, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { brandsApi, type Brand } from "@/lib/brands-api";
import {
  DEFAULT_INTEGRATION_SETTINGS,
  DEFAULT_VOICE_SETTINGS,
  DEFAULT_DESIGN_SETTINGS,
  TONES, TONE_LABELS,
  CTA_STYLES, CTA_STYLE_LABELS,
  LANGUAGE_STYLES, LANGUAGE_STYLE_LABELS,
  TAGLISH_RATIOS, TAGLISH_RATIO_LABELS,
  EMOJI_LEVELS, EMOJI_LEVEL_LABELS,
  type IntegrationSettings,
  type VoiceSettings,
  type DesignSettings,
  type SampleCaption,
} from "@/lib/validations/brand";
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

function coerceIntegration(raw: unknown): IntegrationSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_INTEGRATION_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    integration_enabled: Boolean(r.integration_enabled ?? false),
    api_base_url: String(r.api_base_url ?? ""),
    external_brand_code: String(r.external_brand_code ?? ""),
    big_win_endpoint: String(r.big_win_endpoint ?? ""),
    promo_list_endpoint: String(r.promo_list_endpoint ?? ""),
    tracking_link_base: String(r.tracking_link_base ?? ""),
    hot_games_endpoint: String(r.hot_games_endpoint ?? ""),
    notes: String(r.notes ?? ""),
  };
}

function coerceVoice(raw: unknown): VoiceSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_VOICE_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    tone: (r.tone as VoiceSettings["tone"]) ?? DEFAULT_VOICE_SETTINGS.tone,
    cta_style: (r.cta_style as VoiceSettings["cta_style"]) ?? DEFAULT_VOICE_SETTINGS.cta_style,
    language_style: (r.language_style as VoiceSettings["language_style"]) ?? DEFAULT_VOICE_SETTINGS.language_style,
    taglish_ratio: (r.taglish_ratio as VoiceSettings["taglish_ratio"]) ?? DEFAULT_VOICE_SETTINGS.taglish_ratio,
    emoji_level: (r.emoji_level as VoiceSettings["emoji_level"]) ?? DEFAULT_VOICE_SETTINGS.emoji_level,
    banned_phrases: Array.isArray(r.banned_phrases) ? (r.banned_phrases as string[]) : [],
    default_hashtags: Array.isArray(r.default_hashtags) ? (r.default_hashtags as string[]) : [],
  };
}

function coerceDesign(raw: unknown): DesignSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DESIGN_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    design_theme_notes: String(r.design_theme_notes ?? ""),
    preferred_visual_style: String(r.preferred_visual_style ?? ""),
    headline_style: String(r.headline_style ?? ""),
    button_style: String(r.button_style ?? ""),
    promo_text_style: String(r.promo_text_style ?? ""),
    color_usage_notes: String(r.color_usage_notes ?? ""),
  };
}

function coerceCaptions(raw: unknown): SampleCaption[] {
  return Array.isArray(raw)
    ? (raw as SampleCaption[]).filter((c) => c && typeof c.text === "string")
    : [];
}

// ─── Small shared UI pieces ───────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium">
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
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

// ─── Tag input (banned phrases / default hashtags) ────────────────────────────

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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
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
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

type TabId = "identity" | "integration" | "voice" | "design" | "captions";

interface FormState {
  name: string;
  domain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  active: boolean;
  integration: IntegrationSettings;
  voice: VoiceSettings;
  design: DesignSettings;
  captions: SampleCaption[];
}

function emptyForm(): FormState {
  return {
    name: "",
    domain: "",
    logo_url: "",
    primary_color: "",
    secondary_color: "",
    accent_color: "",
    active: true,
    integration: { ...DEFAULT_INTEGRATION_SETTINGS },
    voice: { ...DEFAULT_VOICE_SETTINGS },
    design: { ...DEFAULT_DESIGN_SETTINGS },
    captions: [],
  };
}

function brandToForm(b: Brand): FormState {
  return {
    name: b.name,
    domain: b.domain ?? "",
    logo_url: b.logo_url ?? "",
    primary_color: b.primary_color ?? "",
    secondary_color: b.secondary_color ?? "",
    accent_color: b.accent_color ?? "",
    active: b.active,
    integration: coerceIntegration(b.integration_settings_json),
    voice: coerceVoice(b.voice_settings_json),
    design: coerceDesign(b.design_settings_json),
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

  function setIntegration(key: keyof IntegrationSettings, value: unknown) {
    setForm((f) => ({ ...f, integration: { ...f.integration, [key]: value } }));
  }

  function setVoice(key: keyof VoiceSettings, value: unknown) {
    setForm((f) => ({ ...f, voice: { ...f.voice, [key]: value } }));
  }

  function setDesign(key: keyof DesignSettings, value: string) {
    setForm((f) => ({ ...f, design: { ...f.design, [key]: value } }));
  }

  // Sample captions helpers
  function addCaption() {
    const newCaption: SampleCaption = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "",
      type: "",
      text: "",
      notes: "",
    };
    setForm((f) => ({ ...f, captions: [...f.captions, newCaption] }));
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

  async function handleSave() {
    if (!form.name.trim()) { setError("Brand name is required"); setTab("identity"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        identity: {
          name: form.name.trim(),
          domain: form.domain || undefined,
          logo_url: form.logo_url || undefined,
          primary_color: form.primary_color || undefined,
          secondary_color: form.secondary_color || undefined,
          accent_color: form.accent_color || undefined,
          active: form.active,
        },
        integration: form.integration,
        voice: form.voice,
        design: form.design,
        sample_captions: form.captions,
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

  return (
    <>
      {/* Trigger rendered outside Dialog to avoid nested-button issues (Base UI) */}
      {cloneElement(trigger, { onClick: openDialog })}

      <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{brand ? `Edit — ${brand.name}` : "Add Brand"}</DialogTitle>
          </DialogHeader>

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
                <div className="space-y-4">
                  <div className="space-y-1">
                    <FieldLabel required>Brand Name</FieldLabel>
                    <input
                      className={inputCls}
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="e.g. Lucky Casino PH"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel>Domain</FieldLabel>
                    <input
                      className={inputCls}
                      value={form.domain}
                      onChange={(e) => set("domain", e.target.value)}
                      placeholder="e.g. luckycasino.ph"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel>Logo URL</FieldLabel>
                    <input
                      className={inputCls}
                      value={form.logo_url}
                      onChange={(e) => set("logo_url", e.target.value)}
                      placeholder="https://..."
                      disabled={saving}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <ColorField label="Primary Color" value={form.primary_color} onChange={(v) => set("primary_color", v)} disabled={saving} />
                    <ColorField label="Secondary Color" value={form.secondary_color} onChange={(v) => set("secondary_color", v)} disabled={saving} />
                    <ColorField label="Accent Color" value={form.accent_color} onChange={(v) => set("accent_color", v)} disabled={saving} />
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
                      Inactive brands are hidden from the brand switcher
                    </span>
                  </div>
                </div>
              )}

              {/* ── B. Integration ── */}
              {tab === "integration" && (
                <div className="space-y-4">
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

                  {[
                    { key: "api_base_url" as const, label: "API Base URL", placeholder: "https://api.brand.com" },
                    { key: "external_brand_code" as const, label: "External Brand Code", placeholder: "BRAND_001" },
                    { key: "big_win_endpoint" as const, label: "Big Win Endpoint", placeholder: "/v1/big-wins" },
                    { key: "promo_list_endpoint" as const, label: "Promo List Endpoint", placeholder: "/v1/promotions" },
                    { key: "tracking_link_base" as const, label: "Tracking Link Base URL", placeholder: "https://track.brand.com" },
                    { key: "hot_games_endpoint" as const, label: "Hot Games Endpoint (optional)", placeholder: "/v1/hot-games" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <FieldLabel>{label}</FieldLabel>
                      <input
                        className={inputCls}
                        value={String(form.integration[key] ?? "")}
                        onChange={(e) => setIntegration(key, e.target.value)}
                        placeholder={placeholder}
                        disabled={saving}
                      />
                    </div>
                  ))}

                  <div className="space-y-1">
                    <FieldLabel>Notes</FieldLabel>
                    <textarea
                      className={textareaCls}
                      rows={3}
                      value={form.integration.notes ?? ""}
                      onChange={(e) => setIntegration("notes", e.target.value)}
                      placeholder="Internal notes about this integration..."
                      disabled={saving}
                    />
                  </div>
                </div>
              )}

              {/* ── C. Voice & Tone ── */}
              {tab === "voice" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: "tone" as const, label: "Tone", options: TONES, labels: TONE_LABELS },
                      { key: "cta_style" as const, label: "CTA Style", options: CTA_STYLES, labels: CTA_STYLE_LABELS },
                      { key: "language_style" as const, label: "Language Style", options: LANGUAGE_STYLES, labels: LANGUAGE_STYLE_LABELS },
                      { key: "taglish_ratio" as const, label: "Taglish Ratio", options: TAGLISH_RATIOS, labels: TAGLISH_RATIO_LABELS },
                      { key: "emoji_level" as const, label: "Emoji Level", options: EMOJI_LEVELS, labels: EMOJI_LEVEL_LABELS },
                    ].map(({ key, label, options, labels }) => (
                      <div key={key} className="space-y-1">
                        <FieldLabel>{label}</FieldLabel>
                        <Select
                          value={(form.voice[key] as string) ?? ""}
                          onValueChange={(v) => setVoice(key, v || undefined)}
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

                  <div className="space-y-1">
                    <FieldLabel>Banned Phrases</FieldLabel>
                    <p className="text-xs text-muted-foreground">Words or phrases to avoid in generated content.</p>
                    <TagInput
                      value={form.voice.banned_phrases ?? []}
                      onChange={(v) => setVoice("banned_phrases", v)}
                      placeholder="Type a phrase and press Enter or Add"
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-1">
                    <FieldLabel>Default Hashtags</FieldLabel>
                    <p className="text-xs text-muted-foreground">Hashtags to include by default in posts.</p>
                    <TagInput
                      value={form.voice.default_hashtags ?? []}
                      onChange={(v) => setVoice("default_hashtags", v)}
                      placeholder="#hashtag"
                      disabled={saving}
                    />
                  </div>
                </div>
              )}

              {/* ── D. Design ── */}
              {tab === "design" && (
                <div className="space-y-4">
                  {[
                    { key: "design_theme_notes" as const, label: "Design Theme Notes", rows: 3, placeholder: "Overall visual theme, mood board references, style direction..." },
                    { key: "preferred_visual_style" as const, label: "Preferred Visual Style", rows: 2, placeholder: "e.g. Bold gradients, minimal flat design..." },
                    { key: "headline_style" as const, label: "Headline Style", rows: 2, placeholder: "e.g. All-caps, sentence case, with emoji prefix..." },
                    { key: "button_style" as const, label: "Button / CTA Style", rows: 2, placeholder: "e.g. Rounded pill, bright yellow, uppercase text..." },
                    { key: "promo_text_style" as const, label: "Promo Text Style", rows: 2, placeholder: "e.g. Short punchy lines, highlight numbers in bold..." },
                    { key: "color_usage_notes" as const, label: "Color Usage Notes", rows: 3, placeholder: "When to use primary vs accent, contrast requirements..." },
                  ].map(({ key, label, rows, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <FieldLabel>{label}</FieldLabel>
                      <textarea
                        className={textareaCls}
                        rows={rows}
                        value={form.design[key] ?? ""}
                        onChange={(e) => setDesign(key, e.target.value)}
                        placeholder={placeholder}
                        disabled={saving}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ── E. Sample Captions ── */}
              {tab === "captions" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Add reference captions that represent this brand's voice. Used as few-shot examples for AI generation.
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
                        <button
                          type="button"
                          onClick={() => removeCaption(idx)}
                          disabled={saving}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <FieldLabel>Title</FieldLabel>
                          <input
                            className={inputCls}
                            value={cap.title ?? ""}
                            onChange={(e) => updateCaption(idx, "title", e.target.value)}
                            placeholder="e.g. Big Win Post"
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
                          placeholder="Write the example caption here..."
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-1">
                        <FieldLabel>Notes</FieldLabel>
                        <input
                          className={inputCls}
                          value={cap.notes ?? ""}
                          onChange={(e) => updateCaption(idx, "notes", e.target.value)}
                          placeholder="Why this caption works, key elements used..."
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

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card px-5 py-4">
      <div className="min-w-0 space-y-2 flex-1">
        {/* Name + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{brand.name}</p>
          <StatusBadge active={brand.active} />
          <IntegrationBadge enabled={integration.integration_enabled} />
        </div>

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
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");

  const { data: brands, isLoading, isError, error } = useQuery({
    queryKey: ["brands", search, activeFilter],
    queryFn: () =>
      brandsApi.list({
        search: search || undefined,
        active: activeFilter || undefined,
      }),
    retry: false,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["brands"] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Brand Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage all brands, their integrations, and content settings.
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
          value={activeFilter || "__all__"}
          onValueChange={(v) => setActiveFilter(!v || v === "__all__" ? "" : (v as "true" | "false"))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="true">Active only</SelectItem>
            <SelectItem value="false">Inactive only</SelectItem>
          </SelectContent>
        </Select>
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

      {!isLoading && !isError && brands?.length === 0 && (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No brands found.</p>
          {canEdit && (
            <p className="mt-1 text-xs text-muted-foreground">
              Click "Add Brand" to create your first brand.
            </p>
          )}
        </div>
      )}

      {!isLoading && !isError && brands && brands.length > 0 && (
        <div className="space-y-3">
          {brands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              canEdit={canEdit}
              onUpdated={invalidate}
            />
          ))}
          <p className="text-xs text-muted-foreground text-right">
            {brands.length} brand{brands.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
