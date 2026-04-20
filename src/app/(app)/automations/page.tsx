"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { automationsApi, type AutomationRule } from "@/lib/automations-api";
import { useActiveBrand } from "@/lib/active-brand-client";
import {
  DEFAULT_BIG_WIN_RULE_CONFIG, type BigWinRuleConfig,
  DEFAULT_ONGOING_PROMOTION_CONFIG, type OnGoingPromotionRuleConfig, type PromoRule,
  DEFAULT_HOT_GAMES_CONFIG, type HotGamesRuleConfig,
  HOT_GAMES_SOURCE_WINDOWS, HOT_GAMES_COUNT_OPTIONS,
} from "@/lib/validations/automation";
import { maskUsername, generateRandomUsername } from "@/lib/username-mask";
import { generateClientId } from "@/lib/client-id";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Plus, Trash2 } from "lucide-react";
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
      className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/20", disabled && "opacity-50 cursor-not-allowed")}
    >
      <span className={cn("pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-4" : "translate-x-0.5")} />
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
        className="w-28 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
  );
}

function ContentQueueNotice() {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/50 px-4 py-3">
      <div className="flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-900">Content Queue Flow</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Matched rules create drafts in Content Queue for operator review. No content is published automatically from this page.
          </p>
        </div>
      </div>
    </div>
  );
}

function CardFooter({ canEdit, dirty, saving, onSave, onReset }: {
  canEdit: boolean; dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void;
}) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-2 px-5 py-3 border-t bg-muted/20">
      <Button size="sm" onClick={onSave} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</Button>
      <Button variant="outline" size="sm" onClick={onReset} disabled={!dirty || saving}>Reset</Button>
    </div>
  );
}

function canEditRules(role?: string) { return role === "admin" || role === "brand_manager"; }

const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const label = i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
  return { value: `${String(i).padStart(2, "0")}:00`, label };
});

const SAMPLE_USERNAMES = [
  "wildspinzuser", "max1234", "luckygamer99", "casinoqueen", "bigwinplayer",
  "starbet2026", "jackpothero", "spinmaster", "royalflush", "diamondking",
];

// ─── Tab types ───────────────────────────────────────────────────────────────

type AutomationTab = "big_win" | "running_promotion" | "hot_games";
const TABS: { id: AutomationTab; label: string }[] = [
  { id: "big_win", label: "Big Wins" },
  { id: "running_promotion", label: "On Going Promotions" },
  { id: "hot_games", label: "Hot Games" },
];

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AutomationRulesPage() {
  const { data: session } = useSession();
  const { isAllBrands, isLoading: brandLoading } = useActiveBrand();
  const queryClient = useQueryClient();
  const canEdit = canEditRules(session?.user?.role);
  const [activeTab, setActiveTab] = useState<AutomationTab>("big_win");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["automations"],
    queryFn: automationsApi.list,
  });

  const rulesByType = useMemo(() => {
    if (!data) return {};
    const rules = Array.isArray(data) ? data : (data as { rules: AutomationRule[] }).rules ?? [];
    return Object.fromEntries(rules.map((r) => [r.rule_type, r])) as Record<string, AutomationRule>;
  }, [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["automations"] });

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

  if (isError) {
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
          Configure rules for automatic draft creation. Matched rules create drafts in the Content Queue.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >{tab.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "big_win" && rulesByType.big_win && (
        <BigWinCard rule={rulesByType.big_win} canEdit={canEdit} onSaved={invalidate} />
      )}
      {activeTab === "running_promotion" && rulesByType.running_promotion && (
        <OnGoingPromotionsCard rule={rulesByType.running_promotion} canEdit={canEdit} onSaved={invalidate} />
      )}
      {activeTab === "hot_games" && rulesByType.hot_games && (
        <HotGamesCard rule={rulesByType.hot_games} canEdit={canEdit} onSaved={invalidate} />
      )}

      {/* Show notice if rule not seeded yet */}
      {!rulesByType[activeTab] && (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">No rule configured for this type yet. Reload to initialize.</p>
        </div>
      )}
    </div>
  );
}

// ─── Config migration helpers ────────────────────────────────────────────────

function migrateBigWin(raw: Record<string, unknown>): BigWinRuleConfig {
  const d = DEFAULT_BIG_WIN_RULE_CONFIG;
  const rawCheck = raw.check_frequency as Record<string, unknown> | undefined;
  const checkFreq = rawCheck && typeof rawCheck.interval_hours === "number"
    ? { interval_hours: rawCheck.interval_hours as number }
    : d.check_frequency;
  const rawCadence = raw.draft_cadence as Record<string, unknown> | undefined;
  const cadence = rawCadence && typeof rawCadence.scan_delay_hours === "number"
    ? { scan_delay_hours: rawCadence.scan_delay_hours as number, sample_count: (rawCadence.sample_count as number) ?? d.draft_cadence.sample_count }
    : d.draft_cadence;
  const rawDefault = raw.default_rule as Record<string, unknown> | undefined;
  const defaultRule = rawDefault
    ? {
        min_payout: (rawDefault.min_payout as number) ?? d.default_rule.min_payout,
        min_multiplier: (rawDefault.min_multiplier as number) ?? d.default_rule.min_multiplier,
        logic: ((rawDefault.logic as "OR" | "AND") ?? d.default_rule.logic),
      }
    : d.default_rule;
  return {
    api_url: (raw.api_url as string) ?? d.api_url,
    check_frequency: checkFreq,
    draft_cadence: cadence,
    default_rule: defaultRule,
    custom_rule_enabled: (raw.custom_rule_enabled as boolean) ?? d.custom_rule_enabled,
    custom_rule: (raw.custom_rule as BigWinRuleConfig["custom_rule"]) ?? d.custom_rule,
    dedupe_key: (raw.dedupe_key as BigWinRuleConfig["dedupe_key"]) ?? d.dedupe_key,
    content_output_rules: (raw.content_output_rules as BigWinRuleConfig["content_output_rules"]) ?? d.content_output_rules,
  };
}

function migrateOngoingPromo(raw: Record<string, unknown>): OnGoingPromotionRuleConfig {
  const d = DEFAULT_ONGOING_PROMOTION_CONFIG;
  if (raw.check_schedule) return { ...d, ...raw } as OnGoingPromotionRuleConfig;
  return d;
}

function migrateHotGames(raw: Record<string, unknown>): HotGamesRuleConfig {
  const d = DEFAULT_HOT_GAMES_CONFIG;
  const count = ((raw.hot_games_count ?? raw.top_games_count) as number) ?? d.hot_games_count;
  const validCount = (HOT_GAMES_COUNT_OPTIONS as readonly number[]).includes(count) ? (count as HotGamesRuleConfig["hot_games_count"]) : d.hot_games_count;
  const sourceWindow = (raw.source_window_minutes as number) ?? d.source_window_minutes;
  const validWindow = (HOT_GAMES_SOURCE_WINDOWS as readonly number[]).includes(sourceWindow) ? (sourceWindow as HotGamesRuleConfig["source_window_minutes"]) : d.source_window_minutes;
  const rawMapping = (raw.time_mapping ?? raw.fixed_time_mapping) as string[] | undefined;
  let mapping = Array.isArray(rawMapping) ? rawMapping : d.time_mapping;
  if (mapping.length > validCount) mapping = mapping.slice(0, validCount);
  while (mapping.length < validCount) mapping = [...mapping, "00:00"];
  return {
    api_url: (raw.api_url as string) ?? d.api_url,
    check_schedule: (raw.check_schedule as HotGamesRuleConfig["check_schedule"]) ?? d.check_schedule,
    source_window_minutes: validWindow,
    hot_games_count: validCount,
    time_mapping: mapping,
    sample_count: (raw.sample_count as number) ?? d.sample_count,
    dedupe_key: (raw.dedupe_key as string) ?? d.dedupe_key,
  };
}

// ─── Big Win Card ────────────────────────────────────────────────────────────

function BigWinCard({ rule, canEdit, onSaved }: { rule: AutomationRule; canEdit: boolean; onSaved: () => void }) {
  const stored = migrateBigWin(rule.config_json);
  const [cfg, setCfg] = useState<BigWinRuleConfig>(stored);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sampleUsername] = useState(() => SAMPLE_USERNAMES[Math.floor(Math.random() * SAMPLE_USERNAMES.length)]);
  const [customSample] = useState(() => generateRandomUsername());

  const original = useMemo(() => migrateBigWin(rule.config_json), [rule.config_json]);
  const dirty = enabled !== rule.enabled || JSON.stringify(cfg) !== JSON.stringify(original);
  const disabled = !canEdit;

  function updateCfg<K extends keyof BigWinRuleConfig>(key: K, value: BigWinRuleConfig[K]) { setCfg((p) => ({ ...p, [key]: value })); }
  function updateNested(path: string, value: unknown) {
    setCfg((p) => {
      const copy = JSON.parse(JSON.stringify(p));
      const parts = path.split(".");
      let obj = copy;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;
      return copy;
    });
  }

  async function handleSave() {
    if (cfg.custom_rule_enabled) {
      if (cfg.custom_rule.payout.min >= cfg.custom_rule.payout.max) { setSaveError("Custom payout: min must be less than max"); return; }
      if (cfg.custom_rule.multiplier.min >= cfg.custom_rule.multiplier.max) { setSaveError("Custom multiplier: min must be less than max"); return; }
    }
    setSaving(true); setSaveError(null);
    try { await automationsApi.update(rule.id, { enabled, config_json: cfg }); onSaved(); }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-base font-semibold">Big Win Rules</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Batch snapshot mode — create drafts when wins match thresholds.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "Active" : "Inactive"}</span>
          <Toggle checked={enabled} onChange={setEnabled} disabled={disabled} />
        </div>
      </div>
      <div className="px-5 py-5 space-y-8">
        {saveError && <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2"><p className="text-sm text-destructive">{saveError}</p></div>}

        <div>
          <SectionLabel>Big Win API</SectionLabel>
          <FieldRow label="Big Win API URL" hint="Used to fetch Big Win data for this brand.">
            <TextInput value={cfg.api_url ?? ""} onChange={(v) => updateCfg("api_url", v || null)} placeholder="https://api.example.com/big-wins" disabled={disabled} />
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Check Frequency</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">System checks source data in batch snapshot mode.</p>
          <FieldRow label="Check every">
            <NumberInput value={cfg.check_frequency.interval_hours} onChange={(v) => updateNested("check_frequency.interval_hours", v)} min={1} max={168} suffix="hours" disabled={disabled} />
          </FieldRow>
          <p className="text-xs text-muted-foreground mt-2">
            Once saved, the cycle anchors to 00:00:00 of the rule creation day and repeats at the selected interval.
          </p>
        </div>

        <div>
          <SectionLabel>Draft Creation Timing</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">A single delay applied once after each scan completes.</p>
          <FieldRow label="Create draft after X hours from scan">
            <NumberInput value={cfg.draft_cadence.scan_delay_hours} onChange={(v) => updateNested("draft_cadence.scan_delay_hours", v)} min={0} max={48} step={0.5} suffix="hours" disabled={disabled} />
          </FieldRow>
          <FieldRow label="Draft sample count">
            <NumberInput value={cfg.draft_cadence.sample_count} onChange={(v) => updateNested("draft_cadence.sample_count", v)} min={1} max={10} disabled={disabled} />
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Default Rule</SectionLabel>
          <FieldRow label="Condition logic" hint="OR: draft if either condition is met. AND: draft only if both are met.">
            <Select value={cfg.default_rule.logic} onValueChange={(v) => updateNested("default_rule.logic", (v ?? "OR") as "OR" | "AND")} disabled={disabled}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OR">OR</SelectItem>
                <SelectItem value="AND">AND</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Create a draft if payout is ≥">
            <NumberInput value={cfg.default_rule.min_payout} onChange={(v) => updateNested("default_rule.min_payout", v)} min={0} disabled={disabled} />
          </FieldRow>
          <FieldRow label="Create a draft if multiplier is ≥">
            <NumberInput value={cfg.default_rule.min_multiplier} onChange={(v) => updateNested("default_rule.min_multiplier", v)} min={0} step={0.1} suffix="x" disabled={disabled} />
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Custom Rule</SectionLabel>
          <FieldRow label="Activate Custom Rule"><Toggle checked={cfg.custom_rule_enabled} onChange={(v) => updateCfg("custom_rule_enabled", v)} disabled={disabled} /></FieldRow>
          {cfg.custom_rule_enabled && (
            <div className="mt-4 space-y-6 rounded-md border border-border p-4 bg-muted/10">
              <div>
                <p className="text-sm font-medium mb-3">Payout-Based Custom Rule</p>
                <FieldRow label="If payout is ≥"><NumberInput value={cfg.custom_rule.payout.min} onChange={(v) => updateNested("custom_rule.payout.min", v)} min={0} disabled={disabled} /></FieldRow>
                <FieldRow label="but less than"><NumberInput value={cfg.custom_rule.payout.max} onChange={(v) => updateNested("custom_rule.payout.max", v)} min={0} disabled={disabled} /></FieldRow>
                <FieldRow label="Add to payout for content display" hint="Display only. Source payout unchanged."><NumberInput value={cfg.custom_rule.payout.increase_pct} onChange={(v) => updateNested("custom_rule.payout.increase_pct", v)} min={0} max={1000} suffix="%" disabled={disabled} /></FieldRow>
              </div>
              <div>
                <p className="text-sm font-medium mb-3">Multiplier-Based Custom Rule</p>
                <FieldRow label="If multiplier is ≥"><NumberInput value={cfg.custom_rule.multiplier.min} onChange={(v) => updateNested("custom_rule.multiplier.min", v)} min={0} step={0.1} suffix="x" disabled={disabled} /></FieldRow>
                <FieldRow label="but less than"><NumberInput value={cfg.custom_rule.multiplier.max} onChange={(v) => updateNested("custom_rule.multiplier.max", v)} min={0} step={0.1} suffix="x" disabled={disabled} /></FieldRow>
                <FieldRow label="Add to multiplier for content display" hint="Display only. Source multiplier unchanged."><NumberInput value={cfg.custom_rule.multiplier.increase_pct} onChange={(v) => updateNested("custom_rule.multiplier.increase_pct", v)} min={0} max={1000} suffix="%" disabled={disabled} /></FieldRow>
              </div>
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Username Display</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">
            Default rule drafts use the source username (masked). Custom rule drafts use a freshly generated random username (6–8 lowercase alphanumeric chars, masked).
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Masking rule: first 2 + * middle + last 2. Usernames of 4 chars or fewer are unchanged.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Default rule example</p>
              <p className="text-sm font-mono bg-muted/30 rounded px-2.5 py-1.5 border">
                {sampleUsername} → {maskUsername(sampleUsername)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Custom rule example</p>
              <p className="text-sm font-mono bg-muted/30 rounded px-2.5 py-1.5 border">
                {customSample} → {maskUsername(customSample)}
              </p>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Content Output Rules</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">Defines what a generated Big Win draft must include.</p>
          <FieldRow label="Game icon"><Toggle checked={cfg.content_output_rules.include_game_icon} onChange={(v) => updateNested("content_output_rules.include_game_icon", v)} disabled={disabled} /></FieldRow>
          <FieldRow label="Bet amount"><Toggle checked={cfg.content_output_rules.include_bet_amount} onChange={(v) => updateNested("content_output_rules.include_bet_amount", v)} disabled={disabled} /></FieldRow>
          <FieldRow label="Win amount"><Toggle checked={cfg.content_output_rules.include_win_amount} onChange={(v) => updateNested("content_output_rules.include_win_amount", v)} disabled={disabled} /></FieldRow>
          <FieldRow label="Date and time"><Toggle checked={cfg.content_output_rules.include_datetime} onChange={(v) => updateNested("content_output_rules.include_datetime", v)} disabled={disabled} /></FieldRow>
          <FieldRow label="Multiplier display" hint="Show multiplier only if it meets the multiplier threshold rule.">
            <Select value={cfg.content_output_rules.multiplier_display_rule} onValueChange={(v) => updateNested("content_output_rules.multiplier_display_rule", v ?? "only_if_meets_threshold")} disabled={disabled}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="only_if_meets_threshold">Only if meets threshold</SelectItem>
                <SelectItem value="always">Always show</SelectItem>
                <SelectItem value="never">Never show</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Deduplication</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">Prevent reprocessing the same win twice.</p>
          <FieldRow label="Dedupe key">
            <Select value={cfg.dedupe_key} onValueChange={(v) => updateCfg("dedupe_key", (v ?? "win_id") as BigWinRuleConfig["dedupe_key"])} disabled={disabled}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="win_id">Win ID</SelectItem>
                <SelectItem value="transaction_id">Transaction ID</SelectItem>
                <SelectItem value="timestamp_user_amount">Timestamp + User + Amount</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Summary</SectionLabel>
          <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1 text-sm">
            <p>Mode: Batch snapshot</p>
            <p>Check: Every {cfg.check_frequency.interval_hours} hour{cfg.check_frequency.interval_hours > 1 ? "s" : ""} (anchor 00:00:00 of rule creation day)</p>
            <p>Draft delay: {cfg.draft_cadence.scan_delay_hours}h after scan, {cfg.draft_cadence.sample_count} sample{cfg.draft_cadence.sample_count > 1 ? "s" : ""}</p>
            <p>Default logic: {cfg.default_rule.logic}</p>
            <p>Dedupe: {cfg.dedupe_key.replace(/_/g, " ")}</p>
          </div>
        </div>

        <ContentQueueNotice />
      </div>
      <CardFooter canEdit={canEdit} dirty={dirty} saving={saving} onSave={handleSave} onReset={() => { setCfg(original); setEnabled(rule.enabled); setSaveError(null); }} />
    </div>
  );
}

// ─── On Going Promotions Card ────────────────────────────────────────────────

function OnGoingPromotionsCard({ rule, canEdit, onSaved }: { rule: AutomationRule; canEdit: boolean; onSaved: () => void }) {
  const stored = migrateOngoingPromo(rule.config_json);
  const [cfg, setCfg] = useState<OnGoingPromotionRuleConfig>(stored);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = useMemo(() => migrateOngoingPromo(rule.config_json), [rule.config_json]);
  const dirty = enabled !== rule.enabled || JSON.stringify(cfg) !== JSON.stringify(original);
  const disabled = !canEdit;

  function updateCfg<K extends keyof OnGoingPromotionRuleConfig>(key: K, value: OnGoingPromotionRuleConfig[K]) { setCfg((p) => ({ ...p, [key]: value })); }

  function addPromoRule() {
    const newRule: PromoRule = {
      id: generateClientId(),
      promo_id: "", promo_name: "",
      posting_mode: "daily",
      recurrence: { time: "15:00" },
      sample_count: 3,
    };
    setCfg((p) => ({ ...p, promo_rules: [...p.promo_rules, newRule] }));
  }

  function updatePromoRule(id: string, updates: Partial<PromoRule>) {
    setCfg((p) => ({
      ...p,
      promo_rules: p.promo_rules.map((r) => r.id === id ? { ...r, ...updates } : r),
    }));
  }

  function removePromoRule(id: string) {
    setCfg((p) => ({ ...p, promo_rules: p.promo_rules.filter((r) => r.id !== id) }));
  }

  async function handleSave() {
    setSaving(true); setSaveError(null);
    try { await automationsApi.update(rule.id, { enabled, config_json: cfg }); onSaved(); }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-base font-semibold">On Going Promotions Rules</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Create drafts for active promotions from source API.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "Active" : "Inactive"}</span>
          <Toggle checked={enabled} onChange={setEnabled} disabled={disabled} />
        </div>
      </div>
      <div className="px-5 py-5 space-y-8">
        {saveError && <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2"><p className="text-sm text-destructive">{saveError}</p></div>}

        <div>
          <SectionLabel>Running Promotions API</SectionLabel>
          <FieldRow label="Running Promotions API URL" hint="Used to fetch currently active promotions.">
            <TextInput value={cfg.api_url ?? ""} onChange={(v) => updateCfg("api_url", v || null)} placeholder="https://api.example.com/promotions" disabled={disabled} />
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Checking Rules</SectionLabel>
          <FieldRow label="Check on">
            <CheckboxGroup options={WEEKDAYS} selected={cfg.check_schedule.weekdays} onChange={(v) => setCfg((p) => ({ ...p, check_schedule: { ...p.check_schedule, weekdays: v as number[] } }))} disabled={disabled} />
          </FieldRow>
          <FieldRow label="Check time">
            <Select value={cfg.check_schedule.time} onValueChange={(v) => setCfg((p) => ({ ...p, check_schedule: { ...p.check_schedule, time: v ?? "09:00" } }))} disabled={disabled}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[240px]">{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Draft creation delay" hint="Generate drafts this many minutes after API check.">
            <NumberInput value={cfg.draft_delay_minutes} onChange={(v) => updateCfg("draft_delay_minutes", v)} min={0} max={120} suffix="min" disabled={disabled} />
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Deduplication</SectionLabel>
          <FieldRow label="Allow duplicate rule creation" hint="When off, already-detected promotions won't create duplicate rules.">
            <Toggle checked={cfg.allow_duplicate_rules} onChange={(v) => updateCfg("allow_duplicate_rules", v)} disabled={disabled} />
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Promotion Rules</SectionLabel>
          {cfg.promo_rules.length === 0 && (
            <p className="text-sm text-muted-foreground mb-3">No promotion rules configured. Add a rule to get started.</p>
          )}
          {cfg.promo_rules.map((pr) => (
            <div key={pr.id} className="rounded-md border border-border p-4 mb-3 bg-muted/10 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{pr.promo_name || "New Promotion Rule"}</p>
                {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePromoRule(pr.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground mb-1">Promo ID</p><TextInput value={pr.promo_id} onChange={(v) => updatePromoRule(pr.id, { promo_id: v })} placeholder="From source API" disabled={disabled} /></div>
                <div><p className="text-xs text-muted-foreground mb-1">Promo Name</p><TextInput value={pr.promo_name} onChange={(v) => updatePromoRule(pr.id, { promo_name: v })} placeholder="Promotion name" disabled={disabled} /></div>
              </div>
              <FieldRow label="Posting mode">
                <Select value={pr.posting_mode} onValueChange={(v) => {
                  const mode = (v ?? "daily") as PromoRule["posting_mode"];
                  const rec = mode === "start_of_promo" ? null : { time: pr.recurrence?.time ?? "15:00", weekdays: pr.recurrence?.weekdays, month_days: pr.recurrence?.month_days };
                  updatePromoRule(pr.id, { posting_mode: mode, recurrence: rec });
                }} disabled={disabled}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="start_of_promo">Start of Promotion</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              {pr.recurrence && pr.posting_mode !== "start_of_promo" && (
                <div className="pl-4 border-l-2 border-border space-y-2">
                  <FieldRow label="Time">
                    <Select value={pr.recurrence.time} onValueChange={(v) => updatePromoRule(pr.id, { recurrence: { ...pr.recurrence!, time: v ?? "15:00" } })} disabled={disabled}>
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-[240px]">{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </FieldRow>
                  {pr.posting_mode === "weekly" && (
                    <FieldRow label="Days">
                      <CheckboxGroup options={WEEKDAYS} selected={pr.recurrence.weekdays ?? []} onChange={(v) => updatePromoRule(pr.id, { recurrence: { ...pr.recurrence!, weekdays: v as number[] } })} disabled={disabled} />
                    </FieldRow>
                  )}
                  {pr.posting_mode === "monthly" && (
                    <FieldRow label="Days of month">
                      <CheckboxGroup options={Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} selected={pr.recurrence.month_days ?? []} onChange={(v) => updatePromoRule(pr.id, { recurrence: { ...pr.recurrence!, month_days: v as number[] } })} disabled={disabled} />
                    </FieldRow>
                  )}
                </div>
              )}
              <FieldRow label="Draft sample count">
                <NumberInput value={pr.sample_count} onChange={(v) => updatePromoRule(pr.id, { sample_count: v })} min={1} max={10} disabled={disabled} />
              </FieldRow>
            </div>
          ))}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={addPromoRule} type="button"><Plus className="h-3.5 w-3.5" /> Add Rule</Button>
          )}
        </div>

        <div>
          <SectionLabel>Summary</SectionLabel>
          <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1 text-sm">
            <p>Check: {cfg.check_schedule.weekdays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).filter(Boolean).join(", ") || "None"} at {cfg.check_schedule.time}</p>
            <p>Draft delay: {cfg.draft_delay_minutes} min after scan</p>
            <p>Rules configured: {cfg.promo_rules.length}</p>
            <p>Duplicates: {cfg.allow_duplicate_rules ? "Allowed" : "Not allowed"}</p>
          </div>
        </div>

        <ContentQueueNotice />
      </div>
      <CardFooter canEdit={canEdit} dirty={dirty} saving={saving} onSave={handleSave} onReset={() => { setCfg(original); setEnabled(rule.enabled); setSaveError(null); }} />
    </div>
  );
}

// ─── Hot Games Card ──────────────────────────────────────────────────────────

function HotGamesCard({ rule, canEdit, onSaved }: { rule: AutomationRule; canEdit: boolean; onSaved: () => void }) {
  const stored = migrateHotGames(rule.config_json);
  const [cfg, setCfg] = useState<HotGamesRuleConfig>(stored);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = useMemo(() => migrateHotGames(rule.config_json), [rule.config_json]);
  const dirty = enabled !== rule.enabled || JSON.stringify(cfg) !== JSON.stringify(original);
  const disabled = !canEdit;

  function updateCfg<K extends keyof HotGamesRuleConfig>(key: K, value: HotGamesRuleConfig[K]) { setCfg((p) => ({ ...p, [key]: value })); }

  function setHotGamesCount(count: HotGamesRuleConfig["hot_games_count"]) {
    setCfg((p) => {
      let mapping = [...p.time_mapping];
      if (mapping.length > count) mapping = mapping.slice(0, count);
      while (mapping.length < count) {
        const last = mapping[mapping.length - 1] ?? "17:00";
        const [h] = last.split(":");
        const nextH = Math.min(23, parseInt(h, 10) + 1);
        mapping.push(`${String(nextH).padStart(2, "0")}:00`);
      }
      return { ...p, hot_games_count: count, time_mapping: mapping };
    });
  }

  function setMappingTime(index: number, time: string) {
    setCfg((p) => {
      const next = [...p.time_mapping];
      next[index] = time;
      return { ...p, time_mapping: next };
    });
  }

  const isAscending = useMemo(() => {
    for (let i = 1; i < cfg.time_mapping.length; i++) {
      if (cfg.time_mapping[i] <= cfg.time_mapping[i - 1]) return false;
    }
    return true;
  }, [cfg.time_mapping]);

  async function handleSave() {
    if (!isAscending) { setSaveError("Times must be in ascending order."); return; }
    setSaving(true); setSaveError(null);
    try { await automationsApi.update(rule.id, { enabled, config_json: cfg }); onSaved(); }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  const firstTime = HOURS.find((h) => h.value === cfg.time_mapping[0])?.label ?? cfg.time_mapping[0];
  const lastTime = HOURS.find((h) => h.value === cfg.time_mapping[cfg.time_mapping.length - 1])?.label ?? cfg.time_mapping[cfg.time_mapping.length - 1];

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div>
          <h2 className="text-base font-semibold">Hot Games Rules</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Create 1 draft featuring top-performing games by RTP.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "Active" : "Inactive"}</span>
          <Toggle checked={enabled} onChange={setEnabled} disabled={disabled} />
        </div>
      </div>
      <div className="px-5 py-5 space-y-8">
        {saveError && <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2"><p className="text-sm text-destructive">{saveError}</p></div>}

        <div>
          <SectionLabel>Hot Games API</SectionLabel>
          <FieldRow label="Hot Games API URL" hint="Used to fetch the top-performing games.">
            <TextInput value={cfg.api_url ?? ""} onChange={(v) => updateCfg("api_url", v || null)} placeholder="https://api.example.com/hot-games" disabled={disabled} />
          </FieldRow>
        </div>

        {/* Frozen snapshot notice */}
        <div className="rounded-md border border-blue-200 bg-blue-50/50 px-4 py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">Frozen Snapshot</p>
              <p className="text-xs text-blue-700 mt-0.5">
                When a scan returns the ranked Hot Games batch, that snapshot is frozen for the resulting drafts.
                Content Queue edits on a Hot Games draft reuse the same snapshot and will not trigger a new API scan.
              </p>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Checking Rules</SectionLabel>
          <FieldRow label="Check on">
            <CheckboxGroup options={WEEKDAYS} selected={cfg.check_schedule.weekdays} onChange={(v) => setCfg((p) => ({ ...p, check_schedule: { ...p.check_schedule, weekdays: v as number[] } }))} disabled={disabled} />
          </FieldRow>
          <FieldRow label="Check time">
            <Select value={cfg.check_schedule.time} onValueChange={(v) => setCfg((p) => ({ ...p, check_schedule: { ...p.check_schedule, time: v ?? "16:00" } }))} disabled={disabled}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[240px]">{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Source Processing</SectionLabel>
          <FieldRow label="Source Window" hint="Get top-performing games from the previous selected number of minutes.">
            <Select value={String(cfg.source_window_minutes)} onValueChange={(v) => updateCfg("source_window_minutes", Number(v ?? 120) as HotGamesRuleConfig["source_window_minutes"])} disabled={disabled}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOT_GAMES_SOURCE_WINDOWS.map((w) => <SelectItem key={w} value={String(w)}>{w} min</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Hot Games Count">
            <Select value={String(cfg.hot_games_count)} onValueChange={(v) => setHotGamesCount(Number(v ?? 6) as HotGamesRuleConfig["hot_games_count"])} disabled={disabled}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOT_GAMES_COUNT_OPTIONS.map((c) => <SelectItem key={c} value={String(c)}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Time Mapping</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">Choose a suggested play time for each ranked game. Times must be in ascending order.</p>
          <div className="space-y-2">
            {cfg.time_mapping.map((t, i) => {
              const prev = i > 0 ? cfg.time_mapping[i - 1] : null;
              const rowInvalid = prev !== null && t <= prev;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-14 text-sm font-medium text-muted-foreground">Hot {i + 1}</span>
                  <Select value={t} onValueChange={(v) => setMappingTime(i, v ?? t)} disabled={disabled}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {rowInvalid && <span className="text-xs text-destructive">Times must be in ascending order.</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <SectionLabel>Output Format</SectionLabel>
          <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1 text-sm">
            <p>1 post containing all {cfg.hot_games_count} games (not separate posts)</p>
            <p>Each game includes: game icon, provider icon, game name</p>
            <p>Purpose: invite users to play top-performing games at suggested times</p>
          </div>
        </div>

        <div>
          <SectionLabel>Draft Creation</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">Drafts are created immediately after a scan returns a valid snapshot.</p>
          <FieldRow label="Draft sample count">
            <NumberInput value={cfg.sample_count} onChange={(v) => updateCfg("sample_count", v)} min={1} max={10} disabled={disabled} />
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Deduplication</SectionLabel>
          <p className="text-xs text-muted-foreground mb-3">Deduplicate by scan timestamp to avoid reprocessing the same batch.</p>
          <FieldRow label="Dedupe key">
            <p className="text-sm">{cfg.dedupe_key.replace(/_/g, " ")}</p>
          </FieldRow>
        </div>

        <div>
          <SectionLabel>Summary</SectionLabel>
          <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1 text-sm">
            <p>Check: {cfg.check_schedule.weekdays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).filter(Boolean).join(", ")} at {cfg.check_schedule.time}</p>
            <p>Source: Top {cfg.hot_games_count} RTP games from previous {cfg.source_window_minutes} min</p>
            <p>Output: 1 post, mapped times {firstTime} – {lastTime}</p>
            <p>Drafts: {cfg.sample_count} sample{cfg.sample_count > 1 ? "s" : ""}, immediate after scan</p>
            <p>Snapshot: frozen per scan (reused on Content Queue edits)</p>
          </div>
        </div>

        <ContentQueueNotice />
      </div>
      <CardFooter canEdit={canEdit} dirty={dirty} saving={saving} onSave={handleSave} onReset={() => { setCfg(original); setEnabled(rule.enabled); setSaveError(null); }} />
    </div>
  );
}
