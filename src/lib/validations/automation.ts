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
  running_promotion: "Automatically create drafts when promotions are scheduled or go live.",
  big_win: "Create drafts in Content Queue when a win record matches your thresholds.",
  educational: "Schedule regular educational content for your audience.",
};

// ─── Big Win Rule Config (V2) ────────────────────────────────────────────────

const customRuleRangeSchema = z.object({
  min: z.number().min(0),
  max: z.number().min(0),
  increase_pct: z.number().min(0).max(1000),
});

export const bigWinRuleConfigSchema = z.object({
  api_url: z.string().nullable().optional(),
  default_rule: z.object({
    min_payout: z.number().min(0),
    min_multiplier: z.number().min(0),
  }),
  custom_rule_enabled: z.boolean(),
  custom_rule: z.object({
    payout: customRuleRangeSchema,
    multiplier: customRuleRangeSchema,
  }),
});

export type BigWinRuleConfig = z.infer<typeof bigWinRuleConfigSchema>;

export const DEFAULT_BIG_WIN_RULE_CONFIG: BigWinRuleConfig = {
  api_url: null,
  default_rule: {
    min_payout: 500,
    min_multiplier: 10,
  },
  custom_rule_enabled: false,
  custom_rule: {
    payout: { min: 1000, max: 5000, increase_pct: 0 },
    multiplier: { min: 50, max: 500, increase_pct: 0 },
  },
};

// ─── Legacy configs (kept for backward compat with existing DB records) ──────

export const runningPromotionConfigSchema = z.object({
  approval_required: z.boolean(),
  auto_post: z.boolean(),
  pre_launch_hours: z.number().int().min(0).max(168),
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
    config: DEFAULT_BIG_WIN_RULE_CONFIG,
  },
  {
    rule_type: "educational",
    rule_name: AUTOMATION_RULE_LABELS.educational,
    config: DEFAULT_EDUCATIONAL_CONFIG,
  },
];
