# 04-automations.md

## Automation Rules

The Automation Rules page is a rules configuration interface only.
It does not generate content, preview content, or publish content.
When a rule is matched, the system creates a draft in Content Queue for review.

### Current Focus: Big Win

Only Big Win rules are active for MVP.
Running Promotion and Educational rule types exist in the database but are hidden from the UI.

---

## Big Win Rule Config

Stored in `config_json` on the `automation_rules` table (rule_type = "big_win").

### Config Shape (V2)

```json
{
  "api_url": "https://api.example.com/big-wins",
  "default_rule": {
    "min_payout": 500,
    "min_multiplier": 10
  },
  "custom_rule_enabled": false,
  "custom_rule": {
    "payout": { "min": 1000, "max": 5000, "increase_pct": 0 },
    "multiplier": { "min": 50, "max": 500, "increase_pct": 0 }
  }
}
```

### Fields

- **api_url** — endpoint for fetching win data (optional, falls back to brand integration setting)
- **default_rule** — basic thresholds using OR logic (payout OR multiplier)
- **custom_rule_enabled** — toggle for range-based custom rules
- **custom_rule.payout** — payout range with display increase percentage
- **custom_rule.multiplier** — multiplier range with display increase percentage

### Display Value Rules

- `increase_pct` adjusts the display value only (for content generation)
- Source values are never modified
- Source value and display value remain conceptually distinct

---

## Default Rule Logic

A draft is created in Content Queue if:
- payout >= min_payout, OR
- multiplier >= min_multiplier

Simple OR logic for MVP.

---

## Custom Rule Logic

When enabled, custom rules are evaluated first (before default rules).

- Payout custom rule: if payout >= min AND payout < max, apply increase_pct to display payout
- Multiplier custom rule: if multiplier >= min AND multiplier < max, apply increase_pct to display multiplier
- If neither custom rule matches, fall back to default rule

Validation: min must be less than max for both custom rule ranges.

---

## Username Masking

All usernames in Big Win content are masked:
- Show first 2 characters + mask middle with * + show last 2 characters
- Usernames of 4 characters or fewer: displayed unchanged

Examples:
- wildspinzuser → wi*********er
- max1234 → ma***34
- abcd → abcd
- ab → ab

Reusable helper: `src/lib/username-mask.ts`

---

## Content Queue Flow

- Matched wins create draft posts in Content Queue
- No content is published directly from the Automation Rules page
- All drafts go through the standard review/approval workflow
- This page does not bypass the human-in-the-loop review process

---

## Page Sections

1. Big Win API — URL configuration
2. Default Rule — payout/multiplier thresholds
3. Custom Rule — range-based rules with display adjustments
4. Username Display — masking preview
5. Rule Result Explanation — live sample evaluation
6. Content Queue Flow Notice — reminder about review workflow

---

## Notes

- Running Promotion and Educational rule types still exist in database
- They are not displayed in the current UI
- They can be re-enabled in a future iteration
- The old BigWinConfig shape (with approval_required, auto_post, cooldown_minutes, value_display) is superseded by the V2 shape
- Old records are migrated at render time by merging with defaults
