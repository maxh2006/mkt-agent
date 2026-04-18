# 04-automations.md

## Automation Rules

Rules-only configuration page with 3 tabs.
Does not generate, preview, or publish content.
Matched rules create drafts in Content Queue for operator review.

---

## Tab 1: Big Wins

Batch snapshot mode — system checks source data periodically.

### Config Shape
```json
{
  "api_url": null,
  "check_frequency": { "interval_days": 2, "time": "11:00" },
  "draft_cadence": { "interval_hours": 2, "sample_count": 3 },
  "default_rule": { "min_payout": 500, "min_multiplier": 10 },
  "custom_rule_enabled": false,
  "custom_rule": {
    "payout": { "min": 1000, "max": 5000, "increase_pct": 0 },
    "multiplier": { "min": 50, "max": 500, "increase_pct": 0 }
  },
  "dedupe_key": "win_id",
  "content_output_rules": {
    "include_game_icon": true, "include_bet_amount": true,
    "include_win_amount": true, "include_datetime": true,
    "multiplier_display_rule": "only_if_meets_threshold"
  }
}
```

### Rules
- Default rule: OR logic (payout ≥ threshold OR multiplier ≥ threshold)
- Custom rule: range-based with display increase %. Source values never modified.
- Content output: game icon, bet amount, win amount, datetime, conditional multiplier
- Username masking: first 2 + * middle + last 2 chars
- Deduplication by win ID, transaction ID, or timestamp+user+amount

---

## Tab 2: On Going Promotions

API-based promotion detection with per-promo rule configuration.

### Config Shape
```json
{
  "api_url": null,
  "check_schedule": { "weekdays": [6], "time": "09:00" },
  "allow_duplicate_rules": false,
  "promo_rules": [],
  "draft_delay_minutes": 30
}
```

### Promo Rule Shape
```json
{
  "id": "uuid", "promo_id": "from-source", "promo_name": "Promo Name",
  "posting_mode": "daily",
  "recurrence": { "time": "15:00", "weekdays": [1, 3] },
  "sample_count": 3
}
```

### Rules
- Check schedule: configurable weekdays + time (default Saturday 9AM)
- Per-promo posting mode: Start of Promo, Daily, Weekly, Monthly
- Recurrence uses same weekday/month-day/time pattern as Events
- Draft delay: minutes after API check
- Deduplication: toggle for allowing duplicate rule creation

---

## Tab 3: Hot Games

Top-performing games by RTP, single-post output.

### Config Shape
```json
{
  "api_url": null,
  "check_schedule": { "weekdays": [2, 4, 6], "time": "16:00" },
  "source_window_minutes": 120,
  "top_games_count": 6,
  "fixed_time_mapping": ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"],
  "draft_delay_minutes": 10,
  "sample_count": 2,
  "dedupe_key": "scan_timestamp"
}
```

### Rules
- Source: top 6 RTP games from previous 120 minutes
- Ranking frozen per scan snapshot
- Output: 1 post containing all ranked games (not separate posts)
- Fixed time mapping: Top 1 = 6PM, Top 2 = 7PM, ..., Top 6 = 11PM
- Each game includes: game icon, provider icon, game name
- Draft delay: 10 min after check
- Sample count: 2 draft samples
- Deduplication by scan timestamp

---

## Shared Rules

- All 3 types stored in `automation_rules` table (rule_type column)
- Config stored in `config_json` (Json column)
- One rule per type per brand (unique constraint)
- Auto-seeded on first access per brand
- Old config shapes migrated at render time
- brand_manager or admin role required to edit

---

## Rule Types in DB

| rule_type | Label | Status |
|-----------|-------|--------|
| big_win | Big Wins | Active tab |
| running_promotion | On Going Promotions | Active tab |
| hot_games | Hot Games | Active tab |
| educational | Educational Posts | Hidden (data preserved) |
