"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { automationsApi, type AutomationRule } from "@/lib/automations-api";
import { useActiveBrand } from "@/lib/active-brand-client";
import { DEFAULT_BIG_WIN_RULE_CONFIG, type BigWinRuleConfig } from "@/lib/validations/automation";
import { maskUsername } from "@/lib/username-mask";
import { Button } from "@/components/ui/button";
import { Info, Dices } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Shared UI primitives ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{children}</h3>;
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2">
      <div className="sm:w-64 shrink-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/20",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span className={cn(
        "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-4" : "translate-x-0.5",
      )} />
    </button>
  );
}

function NumberInput({ value, onChange, min, max, step, suffix, disabled }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="number" value={value} min={min} max={max} step={step ?? 1} disabled={disabled}
        onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        className="w-28 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ─── Permission check ────────────────────────────────────────────────────────

function canEditRules(role?: string) {
  return role === "admin" || role === "brand_manager";
}

// ─── Config migration from old shape ─────────────────────────────────────────

function migrateConfig(raw: Record<string, unknown>): BigWinRuleConfig {
  const d = DEFAULT_BIG_WIN_RULE_CONFIG;
  if (raw.default_rule) {
    return { ...d, ...raw } as BigWinRuleConfig;
  }
  return {
    api_url: (raw.api_url as string) ?? d.api_url,
    default_rule: {
      min_payout: (raw.min_payout as number) ?? d.default_rule.min_payout,
      min_multiplier: (raw.min_multiplier as number) ?? d.default_rule.min_multiplier,
    },
    custom_rule_enabled: d.custom_rule_enabled,
    custom_rule: d.custom_rule,
  };
}

// ─── Sample usernames ────────────────────────────────────────────────────────

const SAMPLE_USERNAMES = [
  "wildspinzuser", "max1234", "luckygamer99", "casinoqueen", "bigwinplayer",
  "starbet2026", "jackpothero", "spinmaster", "royalflush", "diamondking",
  "slotfanatic", "megawin777", "ab", "abcd", "ace",
];

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AutomationRulesPage() {
  const { data: session } = useSession();
  const { isAllBrands, isLoading: brandLoading } = useActiveBrand();
  const queryClient = useQueryClient();
  const canEdit = canEditRules(session?.user?.role);

  const { data: rules, isLoading, isError } = useQuery({
    queryKey: ["automations"],
    queryFn: automationsApi.list,
  });

  const bigWinRule = useMemo(() => {
    if (!rules) return null;
    return (rules as AutomationRule[]).find((r) => r.rule_type === "big_win") ?? null;
  }, [rules]);

  if (brandLoading || isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div><h1 className="text-2xl font-semibold">Automation Rules</h1></div>
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">Loading rules…</p>
        </div>
      </div>
    );
  }

  if (isAllBrands) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div><h1 className="text-2xl font-semibold">Automation Rules</h1></div>
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">Select a specific brand to configure automation rules.</p>
        </div>
      </div>
    );
  }

  if (isError || !bigWinRule) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div><h1 className="text-2xl font-semibold">Automation Rules</h1></div>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">Failed to load automation rules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Automation Rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure big win detection rules for this brand. Matching wins create drafts in the Content Queue.
        </p>
      </div>
      <BigWinRuleCard rule={bigWinRule} canEdit={canEdit} onSaved={() => queryClient.invalidateQueries({ queryKey: ["automations"] })} />
    </div>
  );
}

// ─── Big Win Rule Card ───────────────────────────────────────────────────────

function BigWinRuleCard({ rule, canEdit, onSaved }: { rule: AutomationRule; canEdit: boolean; onSaved: () => void }) {
  const stored = migrateConfig(rule.config_json);
  const [cfg, setCfg] = useState<BigWinRuleConfig>(stored);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sampleUsername, setSampleUsername] = useState("wildspinzuser");

  const original = useMemo(() => migrateConfig(rule.config_json), [rule.config_json]);
  const dirty = enabled !== rule.enabled || JSON.stringify(cfg) !== JSON.stringify(original);

  function updateCfg<K extends keyof BigWinRuleConfig>(key: K, value: BigWinRuleConfig[K]) {
    setCfg((p) => ({ ...p, [key]: value }));
  }

  function updateDefaultRule(field: string, value: number) {
    setCfg((p) => ({ ...p, default_rule: { ...p.default_rule, [field]: value } }));
  }

  function updateCustomPayout(field: string, value: number) {
    setCfg((p) => ({ ...p, custom_rule: { ...p.custom_rule, payout: { ...p.custom_rule.payout, [field]: value } } }));
  }

  function updateCustomMultiplier(field: string, value: number) {
    setCfg((p) => ({ ...p, custom_rule: { ...p.custom_rule, multiplier: { ...p.custom_rule.multiplier, [field]: value } } }));
  }

  function resetForm() {
    setCfg(original);
    setEnabled(rule.enabled);
    setSaveError(null);
  }

  async function handleSave() {
    if (cfg.custom_rule_enabled) {
      if (cfg.custom_rule.payout.min >= cfg.custom_rule.payout.max) {
        setSaveError("Custom payout: minimum must be less than maximum"); return;
      }
      if (cfg.custom_rule.multiplier.min >= cfg.custom_rule.multiplier.max) {
        setSaveError("Custom multiplier: minimum must be less than maximum"); return;
      }
    }
    setSaving(true); setSaveError(null);
    try {
      await automationsApi.update(rule.id, { enabled, config_json: cfg });
      onSaved();
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  function generateUsername() {
    const name = SAMPLE_USERNAMES[Math.floor(Math.random() * SAMPLE_USERNAMES.length)];
    setSampleUsername(name);
  }

  const samplePayout = 6000;
  const sampleMultiplier = 320;
  const explanation = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Source payout: $${samplePayout.toLocaleString()}`);
    lines.push(`Source multiplier: ${sampleMultiplier}x`);

    let matched = false;
    let matchedRule = "";
    let displayPayout = samplePayout;
    let displayMultiplier = sampleMultiplier;

    if (cfg.custom_rule_enabled) {
      const cp = cfg.custom_rule.payout;
      const cm = cfg.custom_rule.multiplier;
      if (samplePayout >= cp.min && samplePayout < cp.max) {
        matched = true;
        matchedRule = "Custom payout rule";
        displayPayout = Math.round(samplePayout * (1 + cp.increase_pct / 100));
      } else if (sampleMultiplier >= cm.min && sampleMultiplier < cm.max) {
        matched = true;
        matchedRule = "Custom multiplier rule";
        displayMultiplier = Math.round(sampleMultiplier * (1 + cm.increase_pct / 100));
      }
    }

    if (!matched) {
      if (samplePayout >= cfg.default_rule.min_payout) {
        matched = true;
        matchedRule = `Default rule (payout ≥ $${cfg.default_rule.min_payout.toLocaleString()})`;
      } else if (sampleMultiplier >= cfg.default_rule.min_multiplier) {
        matched = true;
        matchedRule = `Default rule (multiplier ≥ ${cfg.default_rule.min_multiplier}x)`;
      }
    }

    if (matched) {
      lines.push(`Matched rule: ${matchedRule}`);
      if (displayPayout !== samplePayout) lines.push(`Display payout: $${displayPayout.toLocaleString()}`);
      if (displayMultiplier !== sampleMultiplier) lines.push(`Display multiplier: ${displayMultiplier}x`);
      lines.push(`Username display: ${maskUsername(sampleUsername)}`);
      lines.push(`→ Draft will be created in Content Queue`);
    } else {
      lines.push(`No rule matched — no draft will be created`);
    }
    return lines;
  }, [cfg, sampleUsername]);

  const disabled = !canEdit;

  return (
    <div className="rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-base font-semibold">Big Win Rules</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Create drafts in Content Queue when a win record matches your thresholds.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "Active" : "Inactive"}</span>
          <Toggle checked={enabled} onChange={setEnabled} disabled={disabled} />
        </div>
      </div>

      <div className="px-5 py-5 space-y-8">
        {saveError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-sm text-destructive">{saveError}</p>
          </div>
        )}

        {/* Section 1: Big Win API */}
        <div>
          <SectionLabel>Big Win API</SectionLabel>
          <FieldRow label="Big Win API URL" hint="Endpoint for win data. Leave blank to use brand integration setting.">
            <input type="text" value={cfg.api_url ?? ""} disabled={disabled}
              onChange={(e) => updateCfg("api_url", e.target.value || null)}
              placeholder="https://api.example.com/big-wins"
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </FieldRow>
        </div>

        {/* Section 2: Default Rule */}
        <div>
          <SectionLabel>Default Rule</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">A draft will be created in Content Queue if either condition is met.</p>
          <FieldRow label="Create a draft if payout is ≥">
            <NumberInput value={cfg.default_rule.min_payout} onChange={(v) => updateDefaultRule("min_payout", v)} min={0} suffix="$" disabled={disabled} />
          </FieldRow>
          <FieldRow label="Create a draft if multiplier is ≥">
            <NumberInput value={cfg.default_rule.min_multiplier} onChange={(v) => updateDefaultRule("min_multiplier", v)} min={0} step={0.1} suffix="x" disabled={disabled} />
          </FieldRow>
        </div>

        {/* Section 3: Custom Rule */}
        <div>
          <SectionLabel>Custom Rule</SectionLabel>
          <FieldRow label="Activate Custom Rule">
            <Toggle checked={cfg.custom_rule_enabled} onChange={(v) => updateCfg("custom_rule_enabled", v)} disabled={disabled} />
          </FieldRow>

          {cfg.custom_rule_enabled && (
            <div className="mt-4 space-y-6 rounded-md border border-border p-4 bg-muted/10">
              <div>
                <p className="text-sm font-medium mb-3">Payout-Based Custom Rule</p>
                <FieldRow label="If payout is ≥">
                  <NumberInput value={cfg.custom_rule.payout.min} onChange={(v) => updateCustomPayout("min", v)} min={0} suffix="$" disabled={disabled} />
                </FieldRow>
                <FieldRow label="but less than">
                  <NumberInput value={cfg.custom_rule.payout.max} onChange={(v) => updateCustomPayout("max", v)} min={0} suffix="$" disabled={disabled} />
                </FieldRow>
                <FieldRow label="Add to payout for content display" hint="Used only for content display. Source payout remains unchanged.">
                  <NumberInput value={cfg.custom_rule.payout.increase_pct} onChange={(v) => updateCustomPayout("increase_pct", v)} min={0} max={1000} suffix="%" disabled={disabled} />
                </FieldRow>
                {cfg.custom_rule.payout.min >= cfg.custom_rule.payout.max && (
                  <p className="text-xs text-destructive mt-1">Minimum must be less than maximum.</p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-3">Multiplier-Based Custom Rule</p>
                <FieldRow label="If multiplier is ≥">
                  <NumberInput value={cfg.custom_rule.multiplier.min} onChange={(v) => updateCustomMultiplier("min", v)} min={0} step={0.1} suffix="x" disabled={disabled} />
                </FieldRow>
                <FieldRow label="but less than">
                  <NumberInput value={cfg.custom_rule.multiplier.max} onChange={(v) => updateCustomMultiplier("max", v)} min={0} step={0.1} suffix="x" disabled={disabled} />
                </FieldRow>
                <FieldRow label="Add to multiplier for content display" hint="Used only for content display. Source multiplier remains unchanged.">
                  <NumberInput value={cfg.custom_rule.multiplier.increase_pct} onChange={(v) => updateCustomMultiplier("increase_pct", v)} min={0} max={1000} suffix="%" disabled={disabled} />
                </FieldRow>
                {cfg.custom_rule.multiplier.min >= cfg.custom_rule.multiplier.max && (
                  <p className="text-xs text-destructive mt-1">Minimum must be less than maximum.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Username Display */}
        <div>
          <SectionLabel>Username Display</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">
            All usernames shown publicly display only the first 2 and last 2 characters. Middle characters are masked with *.
          </p>
          <div className="flex items-center gap-3 mb-2">
            <Button variant="outline" size="sm" onClick={generateUsername} type="button">
              <Dices className="h-3.5 w-3.5" /> Generate Sample
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Original</p>
              <p className="text-sm font-mono bg-muted/30 rounded px-2.5 py-1.5 border">{sampleUsername}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Masked</p>
              <p className="text-sm font-mono bg-muted/30 rounded px-2.5 py-1.5 border">{maskUsername(sampleUsername)}</p>
            </div>
          </div>
        </div>

        {/* Section 5: Rule Result Explanation */}
        <div>
          <SectionLabel>Rule Result Explanation</SectionLabel>
          <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1">
            {explanation.map((line, i) => (
              <p key={i} className={cn("text-sm", line.startsWith("→") ? "font-medium text-emerald-700" : line.startsWith("No rule") ? "text-muted-foreground" : "")}>
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* Section 6: Content Queue Flow Notice */}
        <div className="rounded-md border border-blue-200 bg-blue-50/50 px-4 py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">Content Queue Flow</p>
              <p className="text-xs text-blue-700 mt-0.5">
                When a win matches these rules, a draft post is created in the Content Queue for review.
                No content is published automatically from this page.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      {canEdit && (
        <div className="flex items-center gap-2 px-5 py-3 border-t bg-muted/20">
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" size="sm" onClick={resetForm} disabled={!dirty || saving}>
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
