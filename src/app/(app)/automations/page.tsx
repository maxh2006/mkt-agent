"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { automationsApi, type AutomationRule } from "@/lib/automations-api";
import {
  AUTOMATION_RULE_LABELS,
  AUTOMATION_RULE_DESCRIPTIONS,
  DISPLAY_MODES,
  DISPLAY_MODE_LABELS,
  ADJUSTMENT_TYPES,
  ADJUSTMENT_TYPE_LABELS,
  DEFAULT_RUNNING_PROMOTION_CONFIG,
  DEFAULT_BIG_WIN_CONFIG,
  DEFAULT_EDUCATIONAL_CONFIG,
  DEFAULT_VALUE_DISPLAY,
  type RunningPromotionConfig,
  type BigWinConfig,
  type EducationalConfig,
  type ValueDisplayConfig,
} from "@/lib/validations/automation";
import { computeDisplayValue, formatDisplayValue } from "@/lib/display-value";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Permission helper ────────────────────────────────────────────────────────

function canEditAutomations(role?: string) {
  return role === "admin" || role === "brand_manager";
}

// ─── Shared field components ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        className="w-24 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function AutomationCard({
  title,
  description,
  enabled,
  onToggleEnabled,
  canEdit,
  saving,
  saveError,
  onSave,
  onReset,
  dirty,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  canEdit: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onReset: () => void;
  dirty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-colors",
        enabled ? "border-border" : "border-border opacity-80"
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
        <Toggle checked={enabled} onChange={onToggleEnabled} disabled={!canEdit || saving} />
      </div>

      {/* Card body */}
      <div className="px-6 py-4 space-y-4">
        {children}

        {saveError && (
          <p className="text-xs text-destructive">{saveError}</p>
        )}

        {canEdit && (
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={onReset} disabled={saving}>
                Reset
              </Button>
            )}
          </div>
        )}

        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            You need brand manager or admin access to change automation settings.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Value Display Rules section (big_win) ────────────────────────────────────

const PREVIEW_SOURCE = 5432;

function ValueDisplaySection({
  config,
  onChange,
  disabled,
}: {
  config: ValueDisplayConfig;
  onChange: (cfg: ValueDisplayConfig) => void;
  disabled: boolean;
}) {
  const displayValue = computeDisplayValue(PREVIEW_SOURCE, config);
  const displayStr = formatDisplayValue(displayValue, config.display_mode);
  const sourceStr = `$${PREVIEW_SOURCE.toLocaleString()}`;

  const showAdjustment =
    config.display_mode === "adjusted" && config.adjustment_type !== "none";

  return (
    <div className="space-y-3">
      <SectionLabel>Value Display Rules</SectionLabel>

      <div className="rounded-lg border border-border divide-y divide-border">
        <FieldRow
          label="Display mode"
          hint="How the win amount appears in generated content"
        >
          <Select
            value={config.display_mode}
            onValueChange={(v) => v && onChange({ ...config, display_mode: v as ValueDisplayConfig["display_mode"] })}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {DISPLAY_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        {config.display_mode === "adjusted" && (
          <>
            <FieldRow label="Adjustment type">
              <Select
                value={config.adjustment_type}
                onValueChange={(v) => v && onChange({ ...config, adjustment_type: v as ValueDisplayConfig["adjustment_type"] })}
                disabled={disabled}
              >
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ADJUSTMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            {(config.adjustment_type === "subtract" || config.adjustment_type === "multiply") && (
              <FieldRow
                label="Adjustment value"
                hint={config.adjustment_type === "multiply" ? "Multiplier factor (e.g. 0.9 for 90%)" : "Amount to subtract"}
              >
                <NumberInput
                  value={config.adjustment_value}
                  onChange={(v) => onChange({ ...config, adjustment_value: v })}
                  min={0}
                  step={config.adjustment_type === "multiply" ? 0.01 : 1}
                  disabled={disabled}
                />
              </FieldRow>
            )}

            <FieldRow
              label="Max allowed adjustment"
              hint="Warn if display value deviates more than this % from source"
            >
              <NumberInput
                value={config.max_adjustment_pct}
                onChange={(v) => onChange({ ...config, max_adjustment_pct: v })}
                min={0}
                max={100}
                disabled={disabled}
                suffix="%"
              />
            </FieldRow>
          </>
        )}

        <FieldRow
          label="Approval required if adjusted"
          hint="Require manual approval when display value differs from source"
        >
          <Toggle
            checked={config.approval_required_if_adjusted}
            onChange={(v) => onChange({ ...config, approval_required_if_adjusted: v })}
            disabled={disabled}
          />
        </FieldRow>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview (sample source: {sourceStr})</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Source:</span>
          <span className="font-mono">{sourceStr}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">
            {displayStr}
          </span>
          {showAdjustment && Math.abs(displayValue - PREVIEW_SOURCE) / PREVIEW_SOURCE * 100 > config.max_adjustment_pct && (
            <span className="text-xs text-amber-600 font-medium">
              ⚠ Exceeds max adjustment
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Running Promotion Card ───────────────────────────────────────────────────

function RunningPromotionCard({
  rule,
  canEdit,
}: {
  rule: AutomationRule;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const stored = { ...(rule.config_json as RunningPromotionConfig) };
  const [cfg, setCfg] = useState<RunningPromotionConfig>({
    ...DEFAULT_RUNNING_PROMOTION_CONFIG,
    ...stored,
  });
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = { ...DEFAULT_RUNNING_PROMOTION_CONFIG, ...stored };
  const dirty =
    enabled !== rule.enabled || JSON.stringify(cfg) !== JSON.stringify(original);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await automationsApi.update(rule.id, { enabled, config_json: cfg });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setCfg({ ...DEFAULT_RUNNING_PROMOTION_CONFIG, ...stored });
    setEnabled(rule.enabled);
    setSaveError(null);
  }

  return (
    <AutomationCard
      title={AUTOMATION_RULE_LABELS.running_promotion}
      description={AUTOMATION_RULE_DESCRIPTIONS.running_promotion}
      enabled={enabled}
      onToggleEnabled={setEnabled}
      canEdit={canEdit}
      saving={saving}
      saveError={saveError}
      onSave={handleSave}
      onReset={handleReset}
      dirty={dirty}
    >
      <div className="space-y-3">
        <SectionLabel>Settings</SectionLabel>
        <div className="rounded-lg border border-border divide-y divide-border">
          <FieldRow
            label="Require approval"
            hint="Posts enter the review queue before publishing"
          >
            <Toggle checked={cfg.approval_required} onChange={(v) => setCfg((c) => ({ ...c, approval_required: v }))} disabled={!canEdit || saving} />
          </FieldRow>
          <FieldRow
            label="Auto-post"
            hint="Publish directly without operator review (only if approval not required)"
          >
            <Toggle checked={cfg.auto_post} onChange={(v) => setCfg((c) => ({ ...c, auto_post: v }))} disabled={!canEdit || saving || cfg.approval_required} />
          </FieldRow>
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Timing</SectionLabel>
        <div className="rounded-lg border border-border divide-y divide-border">
          <FieldRow
            label="Pre-launch post"
            hint="Generate a post this many hours before the promotion starts"
          >
            <NumberInput
              value={cfg.pre_launch_hours}
              onChange={(v) => setCfg((c) => ({ ...c, pre_launch_hours: Math.round(v) }))}
              min={0}
              max={168}
              disabled={!canEdit || saving}
              suffix="hrs before"
            />
          </FieldRow>
          <FieldRow
            label="Post when live"
            hint="Generate a post the moment the promotion goes live"
          >
            <Toggle checked={cfg.live_post} onChange={(v) => setCfg((c) => ({ ...c, live_post: v }))} disabled={!canEdit || saving} />
          </FieldRow>
          <FieldRow
            label="Last-chance post"
            hint="Generate a post this many hours before the promotion ends"
          >
            <NumberInput
              value={cfg.last_chance_hours}
              onChange={(v) => setCfg((c) => ({ ...c, last_chance_hours: Math.round(v) }))}
              min={0}
              max={72}
              disabled={!canEdit || saving}
              suffix="hrs before end"
            />
          </FieldRow>
        </div>
      </div>
    </AutomationCard>
  );
}

// ─── Big Win Card ─────────────────────────────────────────────────────────────

function BigWinCard({
  rule,
  canEdit,
}: {
  rule: AutomationRule;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const stored = rule.config_json as BigWinConfig;
  const [cfg, setCfg] = useState<BigWinConfig>({
    ...DEFAULT_BIG_WIN_CONFIG,
    ...stored,
    value_display: {
      ...DEFAULT_VALUE_DISPLAY,
      ...(stored.value_display ?? {}),
    },
  });
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original: BigWinConfig = {
    ...DEFAULT_BIG_WIN_CONFIG,
    ...stored,
    value_display: { ...DEFAULT_VALUE_DISPLAY, ...(stored.value_display ?? {}) },
  };
  const dirty =
    enabled !== rule.enabled || JSON.stringify(cfg) !== JSON.stringify(original);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await automationsApi.update(rule.id, { enabled, config_json: cfg });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setCfg({ ...DEFAULT_BIG_WIN_CONFIG, ...stored, value_display: { ...DEFAULT_VALUE_DISPLAY, ...(stored.value_display ?? {}) } });
    setEnabled(rule.enabled);
    setSaveError(null);
  }

  return (
    <AutomationCard
      title={AUTOMATION_RULE_LABELS.big_win}
      description={AUTOMATION_RULE_DESCRIPTIONS.big_win}
      enabled={enabled}
      onToggleEnabled={setEnabled}
      canEdit={canEdit}
      saving={saving}
      saveError={saveError}
      onSave={handleSave}
      onReset={handleReset}
      dirty={dirty}
    >
      <div className="space-y-3">
        <SectionLabel>Settings</SectionLabel>
        <div className="rounded-lg border border-border divide-y divide-border">
          <FieldRow label="Require approval" hint="Posts enter the review queue before publishing">
            <Toggle checked={cfg.approval_required} onChange={(v) => setCfg((c) => ({ ...c, approval_required: v }))} disabled={!canEdit || saving} />
          </FieldRow>
          <FieldRow label="Auto-post" hint="Publish directly without review (only if approval not required)">
            <Toggle checked={cfg.auto_post} onChange={(v) => setCfg((c) => ({ ...c, auto_post: v }))} disabled={!canEdit || saving || cfg.approval_required} />
          </FieldRow>
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Thresholds</SectionLabel>
        <div className="rounded-lg border border-border divide-y divide-border">
          <FieldRow
            label="Minimum payout"
            hint="Only trigger for wins at or above this amount"
          >
            <NumberInput
              value={cfg.min_payout}
              onChange={(v) => setCfg((c) => ({ ...c, min_payout: v }))}
              min={0}
              disabled={!canEdit || saving}
              suffix="$"
            />
          </FieldRow>
          <FieldRow
            label="Minimum multiplier"
            hint="Only trigger for wins with at least this multiplier (0 = any)"
          >
            <NumberInput
              value={cfg.min_multiplier}
              onChange={(v) => setCfg((c) => ({ ...c, min_multiplier: v }))}
              min={0}
              step={0.1}
              disabled={!canEdit || saving}
              suffix="×"
            />
          </FieldRow>
          <FieldRow
            label="Cooldown"
            hint="Minimum time between consecutive big win posts for this brand"
          >
            <NumberInput
              value={cfg.cooldown_minutes}
              onChange={(v) => setCfg((c) => ({ ...c, cooldown_minutes: Math.round(v) }))}
              min={0}
              disabled={!canEdit || saving}
              suffix="min"
            />
          </FieldRow>
        </div>
      </div>

      <ValueDisplaySection
        config={cfg.value_display}
        onChange={(vd) => setCfg((c) => ({ ...c, value_display: vd }))}
        disabled={!canEdit || saving}
      />
    </AutomationCard>
  );
}

// ─── Educational Card ─────────────────────────────────────────────────────────

function EducationalCard({
  rule,
  canEdit,
}: {
  rule: AutomationRule;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const stored = rule.config_json as EducationalConfig;
  const [cfg, setCfg] = useState<EducationalConfig>({
    ...DEFAULT_EDUCATIONAL_CONFIG,
    ...stored,
  });
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = { ...DEFAULT_EDUCATIONAL_CONFIG, ...stored };
  const dirty =
    enabled !== rule.enabled || JSON.stringify(cfg) !== JSON.stringify(original);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await automationsApi.update(rule.id, { enabled, config_json: cfg });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setCfg({ ...DEFAULT_EDUCATIONAL_CONFIG, ...stored });
    setEnabled(rule.enabled);
    setSaveError(null);
  }

  return (
    <AutomationCard
      title={AUTOMATION_RULE_LABELS.educational}
      description={AUTOMATION_RULE_DESCRIPTIONS.educational}
      enabled={enabled}
      onToggleEnabled={setEnabled}
      canEdit={canEdit}
      saving={saving}
      saveError={saveError}
      onSave={handleSave}
      onReset={handleReset}
      dirty={dirty}
    >
      <div className="space-y-3">
        <SectionLabel>Settings</SectionLabel>
        <div className="rounded-lg border border-border divide-y divide-border">
          <FieldRow label="Require approval" hint="Posts enter the review queue before publishing">
            <Toggle checked={cfg.approval_required} onChange={(v) => setCfg((c) => ({ ...c, approval_required: v }))} disabled={!canEdit || saving} />
          </FieldRow>
          <FieldRow label="Auto-post" hint="Publish directly without review (only if approval not required)">
            <Toggle checked={cfg.auto_post} onChange={(v) => setCfg((c) => ({ ...c, auto_post: v }))} disabled={!canEdit || saving || cfg.approval_required} />
          </FieldRow>
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Cadence</SectionLabel>
        <div className="rounded-lg border border-border divide-y divide-border">
          <FieldRow label="Schedule" hint="How often educational posts should be generated">
            <Select
              value={cfg.cadence}
              onValueChange={(v) => v && setCfg((c) => ({ ...c, cadence: v as EducationalConfig["cadence"] }))}
              disabled={!canEdit || saving}
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="manual">Manual only</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          {cfg.cadence === "weekly" && (
            <FieldRow label="Posts per week" hint="Target number of educational posts per week">
              <NumberInput
                value={cfg.posts_per_week}
                onChange={(v) => setCfg((c) => ({ ...c, posts_per_week: Math.round(v) }))}
                min={1}
                max={14}
                disabled={!canEdit || saving}
                suffix="/ week"
              />
            </FieldRow>
          )}
        </div>
      </div>
    </AutomationCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const RULE_TYPE_ORDER = ["running_promotion", "big_win", "educational"] as const;

export default function AutomationsPage() {
  const { data: session } = useSession();
  const canEdit = canEditAutomations(session?.user?.role);

  const { data: rules, isLoading, isError, error } = useQuery({
    queryKey: ["automations"],
    queryFn: automationsApi.list,
    retry: false,
  });

  const isNoBrand =
    isError && error instanceof Error && error.message.includes("No active brand");

  // Index rules by rule_type for ordered rendering
  const ruleMap = new Map(rules?.map((r) => [r.rule_type, r]) ?? []);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Automations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure rules for automatic post generation. Changes apply to this brand only.
        </p>
      </div>

      {/* States */}
      {isNoBrand && (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium">No active brand selected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the brand switcher in the top bar to select a brand.
          </p>
        </div>
      )}

      {isError && !isNoBrand && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load automations"}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          {RULE_TYPE_ORDER.map((t) => (
            <div key={t} className="rounded-xl border border-border bg-card h-24 animate-pulse" />
          ))}
        </div>
      )}

      {/* Cards */}
      {rules && !isError && (
        <div className="space-y-5">
          {RULE_TYPE_ORDER.map((ruleType) => {
            const rule = ruleMap.get(ruleType);
            if (!rule) return null;

            if (ruleType === "running_promotion") {
              return <RunningPromotionCard key={rule.id} rule={rule} canEdit={canEdit} />;
            }
            if (ruleType === "big_win") {
              return <BigWinCard key={rule.id} rule={rule} canEdit={canEdit} />;
            }
            if (ruleType === "educational") {
              return <EducationalCard key={rule.id} rule={rule} canEdit={canEdit} />;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
