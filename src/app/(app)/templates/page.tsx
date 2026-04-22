"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { templatesApi, type Template } from "@/lib/templates-api";
import {
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_TYPE_LABELS_PLURAL,
  TEMPLATE_TYPE_HELPERS,
  TEMPLATE_TAB_ORDER,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  type TemplateType,
  type AssetType,
  type TextTemplateConfig,
  type AssetConfig,
} from "@/lib/validations/template";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Permission helper ────────────────────────────────────────────────────────

function canEdit(role?: string) {
  return role === "admin" || role === "brand_manager";
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = TemplateType;

const TABS: { id: Tab; label: string }[] = TEMPLATE_TAB_ORDER.map((id) => ({
  id,
  label: TEMPLATE_TYPE_LABELS_PLURAL[id],
}));

// ─── Shared input style ───────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ─── Per-type concrete placeholders (AI-aware copy) ───────────────────────────

const NAME_PLACEHOLDERS: Record<Tab, string> = {
  caption: "e.g. Big Win — 3-line celebration",
  banner: "e.g. Weekly promo — short reward overlay",
  prompt: "e.g. Casino-night hero scene",
  cta: "e.g. Short urgency CTA",
  asset: "e.g. Mascot — hero pose",
};

const CONTENT_PLACEHOLDERS: Record<Tab, string> = {
  caption:
    "e.g.\n{hook emoji} {headline}\n\n{player_handle} hit {win_amount} on {game_name}!\n\n{cta}",
  banner: "e.g. {WIN_AMOUNT} WIN",
  prompt:
    "e.g. Celebration-themed scene for {brand}. {game_name} artwork background, confetti, bold gold {win_amount} overlay, brand color accents ({primary}, {accent}). Mood: exciting, premium, trustworthy.",
  cta: "e.g. Claim your bonus now →",
  asset: "",
};

const NOTES_PLACEHOLDERS: Record<Tab, string> = {
  caption: "When to use this pattern — e.g. 'High-multiplier wins, casual tone'",
  banner: "When to use this pattern — e.g. 'Celebratory banners over 100x multiplier'",
  prompt: "When to reuse this prompt — e.g. 'Any Big Win creative, evening slots'",
  cta: "When to use this CTA — e.g. 'Time-bound promos with hard deadline'",
  asset: "How this asset is used — e.g. 'Mascot layered over JILI game thumbs'",
};

// ─── Template form ────────────────────────────────────────────────────────────

interface TemplateFormState {
  name: string;
  content: string;     // for text types
  notes: string;
  url: string;         // for asset
  asset_type: AssetType;
  active: boolean;
}

const EMPTY_FORM: TemplateFormState = {
  name: "",
  content: "",
  notes: "",
  url: "",
  asset_type: "image",
  active: true,
};

function initFormFromTemplate(t: Template): TemplateFormState {
  const cfg = t.config_json as Record<string, unknown>;
  return {
    name: t.name,
    active: t.active,
    content: (cfg.content as string) ?? "",
    notes: (cfg.notes as string) ?? "",
    url: (cfg.url as string) ?? "",
    asset_type: (cfg.asset_type as AssetType) ?? "image",
  };
}

function TemplateFormDialog({
  templateType,
  existing,
  onClose,
  onSaved,
}: {
  templateType: Tab;
  existing: Template | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TemplateFormState>(
    existing ? initFormFromTemplate(existing) : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof TemplateFormState, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required"); return; }

    const isAsset = templateType === "asset";
    if (isAsset && !form.url.trim()) { setError("URL is required for reference assets"); return; }
    if (!isAsset && !form.content.trim()) { setError("Content is required"); return; }

    setSaving(true);
    setError(null);
    try {
      const config: TextTemplateConfig | AssetConfig = isAsset
        ? { url: form.url.trim(), asset_type: form.asset_type, notes: form.notes.trim() || undefined }
        : { content: form.content.trim(), notes: form.notes.trim() || undefined };

      if (existing) {
        await templatesApi.update(existing.id, {
          name: form.name.trim(),
          active: form.active,
          config,
        });
      } else {
        await templatesApi.create({
          template_type: templateType as TemplateType,
          name: form.name.trim(),
          active: form.active,
          config,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const isAsset = templateType === "asset";
  const title = existing
    ? `Edit ${TEMPLATE_TYPE_LABELS[templateType]}`
    : `New ${TEMPLATE_TYPE_LABELS[templateType]}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Per-type helper — explains the reusable-library role */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {TEMPLATE_TYPE_HELPERS[templateType]}
        </p>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={255}
              placeholder={NAME_PLACEHOLDERS[templateType]}
              disabled={saving}
              className={inputClass}
            />
          </div>

          {/* Content (text templates) */}
          {!isAsset && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {templateType === "prompt" ? "Prompt scaffold" : templateType === "cta" ? "CTA line" : "Pattern"}
              </label>
              <textarea
                value={form.content}
                onChange={(e) => set("content", e.target.value)}
                maxLength={5000}
                rows={5}
                placeholder={CONTENT_PLACEHOLDERS[templateType]}
                disabled={saving}
                className={inputClass + " resize-y min-h-24"}
              />
              <p className="text-xs text-muted-foreground text-right">
                {form.content.length}/5000
              </p>
            </div>
          )}

          {/* URL + asset type (asset templates) */}
          {isAsset && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL</label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => set("url", e.target.value)}
                  maxLength={2048}
                  placeholder="https://cdn.example.com/reference.png"
                  disabled={saving}
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  File hosting is not wired in this build — paste a publicly hosted URL.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Asset type</label>
                <select
                  value={form.asset_type}
                  onChange={(e) => set("asset_type", e.target.value)}
                  disabled={saving}
                  className={inputClass}
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Usage notes{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={500}
              placeholder={NOTES_PLACEHOLDERS[templateType]}
              disabled={saving}
              className={inputClass}
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm">Active</span>
            <span className="text-xs text-muted-foreground">
              — inactive entries are hidden from AI reuse
            </span>
          </label>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save Changes" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  canEditTemplate,
  onEdit,
  onDuplicate,
  onToggle,
}: {
  template: Template;
  canEditTemplate: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
}) {
  const cfg = template.config_json as Record<string, unknown>;
  const isAsset = template.template_type === "asset";
  const isGlobal = template.brand_id === null;

  return (
    <div className={`rounded-xl border border-border bg-card p-4 space-y-3 ${!template.active ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{template.name}</span>
          {isGlobal && (
            <Badge variant="secondary" className="text-xs shrink-0">Global</Badge>
          )}
          {!template.active && (
            <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">Inactive</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Operator/brand_manager can duplicate */}
          <button
            onClick={onDuplicate}
            title="Duplicate"
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
          >
            Duplicate
          </button>
          {/* Only brand_manager+ can edit/toggle — and only own brand templates */}
          {canEditTemplate && !isGlobal && (
            <>
              <button
                onClick={onEdit}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
              >
                Edit
              </button>
              <button
                onClick={onToggle}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
              >
                {template.active ? "Deactivate" : "Activate"}
              </button>
            </>
          )}
        </div>
      </div>

      {isAsset ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {ASSET_TYPE_LABELS[(cfg.asset_type as AssetType) ?? "image"]}
          </p>
          <p className="text-xs font-mono text-muted-foreground truncate">{cfg.url as string}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
          {(cfg.content as string) || <span className="italic">No content</span>}
        </p>
      )}

      {typeof cfg.notes === "string" && cfg.notes && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">
          {cfg.notes}
        </p>
      )}
    </div>
  );
}

// ─── Tab section ──────────────────────────────────────────────────────────────

function TemplateSection({
  templates,
  templateType,
  canEditSection,
  isLoading,
  onRefresh,
}: {
  templates: Template[];
  templateType: Tab;
  canEditSection: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [dialog, setDialog] = useState<"create" | Template | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggle(t: Template) {
    setToggling(t.id);
    try {
      await templatesApi.update(t.id, { active: !t.active });
      onRefresh();
    } catch {
      // silent — the user can try again
    } finally {
      setToggling(null);
    }
  }

  function handleDuplicate(t: Template) {
    // Pre-fill create form with the template's content
    setDialog({ ...t, id: "", name: `${t.name} (copy)`, brand_id: "brand" });
  }

  const visible = templates.filter((t) => t.template_type === templateType);

  return (
    <>
      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {TEMPLATE_TYPE_LABELS_PLURAL[templateType]}
          </p>
          {canEditSection && (
            <Button size="sm" variant="outline" onClick={() => setDialog("create")}>
              + New
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {TEMPLATE_TYPE_HELPERS[templateType]}
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-28 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && visible.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No {TEMPLATE_TYPE_LABELS_PLURAL[templateType].toLowerCase()} yet.
            {canEditSection && " Click + New to add one."}
          </p>
        </div>
      )}

      {!isLoading && visible.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              canEditTemplate={canEditSection && toggling !== t.id}
              onEdit={() => setDialog(t)}
              onDuplicate={() => handleDuplicate(t)}
              onToggle={() => handleToggle(t)}
            />
          ))}
        </div>
      )}

      {dialog !== null && (
        <TemplateFormDialog
          templateType={templateType}
          existing={dialog === "create" ? null : (dialog.id === "" ? null : dialog)}
          onClose={() => setDialog(null)}
          onSaved={onRefresh}
        />
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const editable = canEdit(session?.user?.role);
  const [activeTab, setActiveTab] = useState<Tab>(TEMPLATE_TAB_ORDER[0]);

  const { data: templates, isLoading, isError, error } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templatesApi.list({ include_global: true }),
    retry: false,
  });

  const isNoBrand =
    isError && error instanceof Error && error.message.includes("No active brand");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Templates &amp; Assets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable library of copy patterns, CTA snippets, banner text, prompt scaffolds, and reference assets. Operators and the AI content generator draw from these as supporting material.
        </p>
      </div>

      {/* Brand-precedence callout */}
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
        Not base AI rules — positioning, tone, language, audience, banned
        topics, and brand notes live in <span className="font-medium text-foreground">Brand Management</span>. Event briefs remain the situational override. This page is a reusable supporting library.
      </div>

      {/* No active brand */}
      {isNoBrand && (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium">No active brand selected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the brand switcher in the top bar to select a brand.
          </p>
        </div>
      )}

      {/* Generic error */}
      {isError && !isNoBrand && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load templates"}
          </p>
        </div>
      )}

      {!isError && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {TABS.map((tab) => {
              const count = templates?.filter((t) => t.template_type === tab.id).length ?? 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {templates && (
                    <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active tab content */}
          <TemplateSection
            templates={templates ?? []}
            templateType={activeTab}
            canEditSection={editable}
            isLoading={isLoading}
            onRefresh={invalidate}
          />
        </>
      )}
    </div>
  );
}
