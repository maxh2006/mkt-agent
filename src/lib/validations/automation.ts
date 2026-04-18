import { z } from "zod";

// ─── Rule type registry ───────────────────────────────────────────────────────

export const AUTOMATION_RULE_TYPES = [
  "running_promotion",
  "big_win",
  "educational",
  "hot_games",
] as const;

export type AutomationRuleType = (typeof AUTOMATION_RULE_TYPES)[number];

export const AUTOMATION_RULE_LABELS: Record<AutomationRuleType, string> = {
  running_promotion: "On Going Promotions",
  big_win: "Big Wins",
  educational: "Educational Posts",
  hot_games: "Hot Games",
};

export const AUTOMATION_RULE_DESCRIPTIONS: Record<AutomationRuleType, string> = {
  running_promotion: "Create drafts in Content Queue for active promotions.",
  big_win: "Create drafts in Content Queue when a win record matches your thresholds.",
  educational: "Schedule regular educational content for your audience.",
  hot_games: "Create drafts featuring top-performing games by RTP.",
};

// ─── Big Win Rule Config ─────────────────────────────────────────────────────

const customRuleRangeSchema = z.object({
  min: z.number().min(0),
  max: z.number().min(0),
  increase_pct: z.number().min(0).max(1000),
});

export const bigWinRuleConfigSchema = z.object({
  api_url: z.string().nullable().optional(),
  check_frequency: z.object({
    interval_days: z.number().int().min(1).max(30),
    time: z.string(),
  }),
  draft_cadence: z.object({
    interval_hours: z.number().min(1).max(24),
    sample_count: z.number().int().min(1).max(10),
  }),
  default_rule: z.object({
    min_payout: z.number().min(0),
    min_multiplier: z.number().min(0),
  }),
  custom_rule_enabled: z.boolean(),
  custom_rule: z.object({
    payout: customRuleRangeSchema,
    multiplier: customRuleRangeSchema,
  }),
  dedupe_key: z.enum(["win_id", "transaction_id", "timestamp_user_amount"]),
  content_output_rules: z.object({
    include_game_icon: z.boolean(),
    include_bet_amount: z.boolean(),
    include_win_amount: z.boolean(),
    include_datetime: z.boolean(),
    multiplier_display_rule: z.enum(["only_if_meets_threshold", "always", "never"]),
  }),
});

export type BigWinRuleConfig = z.infer<typeof bigWinRuleConfigSchema>;

export const DEFAULT_BIG_WIN_RULE_CONFIG: BigWinRuleConfig = {
  api_url: null,
  check_frequency: { interval_days: 2, time: "11:00" },
  draft_cadence: { interval_hours: 2, sample_count: 3 },
  default_rule: { min_payout: 500, min_multiplier: 10 },
  custom_rule_enabled: false,
  custom_rule: {
    payout: { min: 1000, max: 5000, increase_pct: 0 },
    multiplier: { min: 50, max: 500, increase_pct: 0 },
  },
  dedupe_key: "win_id",
  content_output_rules: {
    include_game_icon: true,
    include_bet_amount: true,
    include_win_amount: true,
    include_datetime: true,
    multiplier_display_rule: "only_if_meets_threshold",
  },
};

// ─── On Going Promotions Rule Config ─────────────────────────────────────────

const promoRuleSchema = z.object({
  id: z.string(),
  promo_id: z.string(),
  promo_name: z.string(),
  posting_mode: z.enum(["start_of_promo", "daily", "weekly", "monthly"]),
  recurrence: z.object({
    time: z.string(),
    weekdays: z.array(z.number().int().min(1).max(7)).optional(),
    month_days: z.array(z.number().int().min(1).max(31)).optional(),
  }).nullable(),
  sample_count: z.number().int().min(1).max(10),
});

export type PromoRule = z.infer<typeof promoRuleSchema>;

export const onGoingPromotionRuleConfigSchema = z.object({
  api_url: z.string().nullable().optional(),
  check_schedule: z.object({
    weekdays: z.array(z.number().int().min(1).max(7)),
    time: z.string(),
  }),
  allow_duplicate_rules: z.boolean(),
  promo_rules: z.array(promoRuleSchema),
  draft_delay_minutes: z.number().int().min(0).max(120),
});

export type OnGoingPromotionRuleConfig = z.infer<typeof onGoingPromotionRuleConfigSchema>;

export const DEFAULT_ONGOING_PROMOTION_CONFIG: OnGoingPromotionRuleConfig = {
  api_url: null,
  check_schedule: { weekdays: [6], time: "09:00" },
  allow_duplicate_rules: false,
  promo_rules: [],
  draft_delay_minutes: 30,
};

// ─── Hot Games Rule Config ───────────────────────────────────────────────────

export const hotGamesRuleConfigSchema = z.object({
  api_url: z.string().nullable().optional(),
  check_schedule: z.object({
    weekdays: z.array(z.number().int().min(1).max(7)),
    time: z.string(),
  }),
  source_window_minutes: z.number().int().min(30).max(1440),
  top_games_count: z.number().int().min(1).max(20),
  fixed_time_mapping: z.array(z.string()),
  draft_delay_minutes: z.number().int().min(0).max(120),
  sample_count: z.number().int().min(1).max(10),
  dedupe_key: z.string(),
});

export type HotGamesRuleConfig = z.infer<typeof hotGamesRuleConfigSchema>;

export const DEFAULT_HOT_GAMES_CONFIG: HotGamesRuleConfig = {
  api_url: null,
  check_schedule: { weekdays: [2, 4, 6], time: "16:00" },
  source_window_minutes: 120,
  top_games_count: 6,
  fixed_time_mapping: ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"],
  draft_delay_minutes: 10,
  sample_count: 2,
  dedupe_key: "scan_timestamp",
};

// ─── Legacy configs (kept for backward compat with existing DB records) ──────

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
    rule_type: "big_win",
    rule_name: AUTOMATION_RULE_LABELS.big_win,
    config: DEFAULT_BIG_WIN_RULE_CONFIG,
  },
  {
    rule_type: "running_promotion",
    rule_name: AUTOMATION_RULE_LABELS.running_promotion,
    config: DEFAULT_ONGOING_PROMOTION_CONFIG,
  },
  {
    rule_type: "hot_games",
    rule_name: AUTOMATION_RULE_LABELS.hot_games,
    config: DEFAULT_HOT_GAMES_CONFIG,
  },
  {
    rule_type: "educational",
    rule_name: AUTOMATION_RULE_LABELS.educational,
    config: DEFAULT_EDUCATIONAL_CONFIG,
  },
];
