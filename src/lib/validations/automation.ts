import { z } from "zod";

// ─── Rule type registry ───────────────────────────────────────────────────────

export const AUTOMATION_RULE_TYPES = [
  "running_promotion",
  "big_win",
  "educational",
] as const;

export type AutomationRuleType = (typeof AUTOMATION_RULE_TYPES)[number];

export const AUTOMATION_RULE_LABELS: Record<AutomationRuleType, string> = {
  running_promotion: "Running Promotions",
  big_win: "Big Win Posts",
  educational: "Educational Posts",
};

export const AUTOMATION_RULE_DESCRIPTIONS: Record<AutomationRuleType, string> = {
  running_promotion: "Automatically generate posts when promotions are scheduled or go live.",
  big_win: "Generate posts when backend qualifies a win record above your thresholds.",
  educational: "Schedule regular educational content for your audience.",
};

// ─── Value Display Rules (big_win only for now) ───────────────────────────────

export const DISPLAY_MODES = [
  "exact",
  "rounded",
  "threshold_headline",
  "range_headline",
  "adjusted",
] as const;

export const ADJUSTMENT_TYPES = [
  "none",
  "round_down",
  "round_up",
  "subtract",
  "multiply",
] as const;

export const DISPLAY_MODE_LABELS: Record<string, string> = {
  exact: "Exact value",
  rounded: "Rounded value",
  threshold_headline: "Threshold headline (e.g. 'Over $1,000')",
  range_headline: "Range headline (e.g. '$500–$1,000')",
  adjusted: "Adjusted display value",
};

export const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  none: "No adjustment",
  round_down: "Round down",
  round_up: "Round up",
  subtract: "Subtract fixed amount",
  multiply: "Multiply by factor",
};

export const valueDisplaySchema = z.object({
  display_mode: z.enum(DISPLAY_MODES),
  adjustment_type: z.enum(ADJUSTMENT_TYPES),
  adjustment_value: z.number().min(0),
  max_adjustment_pct: z.number().min(0).max(100),
  approval_required_if_adjusted: z.boolean(),
});

export type ValueDisplayConfig = z.infer<typeof valueDisplaySchema>;

export const DEFAULT_VALUE_DISPLAY: ValueDisplayConfig = {
  display_mode: "exact",
  adjustment_type: "none",
  adjustment_value: 0,
  max_adjustment_pct: 10,
  approval_required_if_adjusted: true,
};

// ─── Per-rule config schemas ──────────────────────────────────────────────────

export const runningPromotionConfigSchema = z.object({
  approval_required: z.boolean(),
  auto_post: z.boolean(),
  pre_launch_hours: z.number().int().min(0).max(168),   // 0–7 days
  live_post: z.boolean(),
  last_chance_hours: z.number().int().min(0).max(72),
});

export type RunningPromotionConfig = z.infer<typeof runningPromotionConfigSchema>;

export const DEFAULT_RUNNING_PROMOTION_CONFIG: RunningPromotionConfig = {
  approval_required: true,
  auto_post: false,
  pre_launch_hours: 24,
  live_post: true,
  last_chance_hours: 2,
};

export const bigWinConfigSchema = z.object({
  approval_required: z.boolean(),
  auto_post: z.boolean(),
  min_payout: z.number().min(0),
  min_multiplier: z.number().min(0),
  cooldown_minutes: z.number().int().min(0),
  value_display: valueDisplaySchema,
});

export type BigWinConfig = z.infer<typeof bigWinConfigSchema>;

export const DEFAULT_BIG_WIN_CONFIG: BigWinConfig = {
  approval_required: true,
  auto_post: false,
  min_payout: 500,
  min_multiplier: 10,
  cooldown_minutes: 60,
  value_display: DEFAULT_VALUE_DISPLAY,
};

export const educationalConfigSchema = z.object({
  approval_required: z.boolean(),
  auto_post: z.boolean(),
  cadence: z.enum(["daily", "weekly", "manual"]),
  posts_per_week: z.number().int().min(1).max(14),
});

export type EducationalConfig = z.infer<typeof educationalConfigSchema>;

export const DEFAULT_EDUCATIONAL_CONFIG: EducationalConfig = {
  approval_required: true,
  auto_post: false,
  cadence: "weekly",
  posts_per_week: 2,
};

// ─── PATCH body schema ────────────────────────────────────────────────────────

export const updateAutomationSchema = z.object({
  enabled: z.boolean().optional(),
  config_json: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;

// ─── Default records seeded per brand ────────────────────────────────────────

export const DEFAULT_AUTOMATION_SEEDS: Array<{
  rule_type: AutomationRuleType;
  rule_name: string;
  config: object;
}> = [
  {
    rule_type: "running_promotion",
    rule_name: AUTOMATION_RULE_LABELS.running_promotion,
    config: DEFAULT_RUNNING_PROMOTION_CONFIG,
  },
  {
    rule_type: "big_win",
    rule_name: AUTOMATION_RULE_LABELS.big_win,
    config: DEFAULT_BIG_WIN_CONFIG,
  },
  {
    rule_type: "educational",
    rule_name: AUTOMATION_RULE_LABELS.educational,
    config: DEFAULT_EDUCATIONAL_CONFIG,
  },
];

// computeDisplayValue and formatDisplayValue have been moved to src/lib/display-value.ts.
// They are presentation-only utilities and must not be imported in route handlers or
// any server-side code that writes to the database.
