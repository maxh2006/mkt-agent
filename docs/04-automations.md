# 04-automations.md

## Automation Rules

Rules-only configuration page with 3 tabs.
Does not generate, preview, or publish content.
Matched rules create drafts in Content Queue for operator review.

---

## Data Source

Big Wins and Hot Games read from the shared BigQuery dataset provided by the platform team.
On Going Promotions uses a separate API URL (not from BigQuery).

**BigQuery dataset**
- Tables: `shared.users`, `shared.transactions`, `shared.game_rounds`, `shared.games`
- Sync: hourly at :00 GMT+8. ~1 hour delay from real time.
- Read-only. PII removed (email, phone, real name, IP, KYC) — username is a display handle, not classified as PII.
- Query execution billed to our GCP project (`mktagent-493404`). Platform team's project owns storage; we own query costs.

**Env vars** (see `.env.production.example`):
- `BQ_PLATFORM_PROJECT_ID` — platform team's GCP project ID
- `BQ_DATASET` — always `"shared"`
- `BQ_SERVICE_ACCOUNT_EMAIL` — our service account, granted `roles/bigquery.dataViewer` by platform team

**Cost/constraint rules**
- Never `SELECT *`. List columns explicitly.
- Always use partition-friendly filters: `WHERE bet_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL N MINUTE)`.
- Queries must run in our own project (use `projectId: "mktagent-493404"` in SDK).
- Never use `information_schema.columns` for dynamic column discovery.
- Set a GCP monthly budget alert ($100 recommended).

**Schema volatility**
Platform is still being built. Columns may be renamed or added.
- Schema changes are announced in the platform team's Telegram channel with 1-week advance notice.
- All column references should be centralized (later: `src/lib/bq/shared-schema.ts`) so drift can be absorbed in one place.
- A daily health-check query should verify expected columns exist.

---

### Big Wins field mapping
- payout threshold → `shared.game_rounds.payout_amount`
- multiplier threshold → `shared.game_rounds.win_multiplier` (pre-computed integer)
- status filter → `status = 'settled'`
- game icon → `shared.games.game_icon` (public URL)
- username → `shared.users.username` scoped by `brand_id` (pending platform team confirmation; see follow-ups). Masked via `maskUsername()` before display.
- dedupe key: current config options (`win_id`, `transaction_id`) do not map directly to `shared.game_rounds` columns — flagged as a follow-up, likely derived from `user_id + bet_at + payout_amount`.

### Hot Games field mapping
- per-game RTP aggregated from `shared.game_rounds` over `source_window_minutes`
- joined to `shared.games` for name, icon, vendor
- partition-friendly filter on `bet_at`

### Multi-brand identity
The same username (e.g. `maxtest`) can exist across brands. The effective identity is `(username, brand_id)`. All joins and dedupes must be brand-scoped.

---

## Tab 1: Big Wins

Batch snapshot mode — system checks source data periodically.

### Config Shape
```json
{
  "check_frequency": { "interval_hours": 6 },
  "draft_cadence": { "scan_delay_hours": 2, "sample_count": 3 },
  "default_rule": { "min_payout": 500, "min_multiplier": 10, "logic": "OR" },
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
- Check frequency: hourly interval. Anchor starts at 00:00:00 of the rule creation day
  and repeats at the selected interval from that anchor.
- Draft creation timing: single delay (scan_delay_hours) applied once after each scan
  completes — not recurring draft creation.
- Default rule: supports AND or OR logic between payout and multiplier thresholds
  (default OR). AND requires both conditions met. OR requires either condition met.
- Custom rule: range-based with display increase %. Source values never modified.
- Content output: game icon, bet amount, win amount, datetime, conditional multiplier
- Username masking: first 2 + * middle + last 2 chars (reusable helper maskUsername)
- Username source:
  - Default rule drafts: use original source username (then masked)
  - Custom rule drafts: generate a fresh random username per draft (6–8 lowercase
    alphanumeric chars a-z and 0-9, then masked). Source username is not used.
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
  "check_schedule": { "weekdays": [2, 4, 6], "time": "16:00" },
  "source_window_minutes": 120,
  "hot_games_count": 6,
  "time_mapping": ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"],
  "sample_count": 2,
  "dedupe_key": "scan_timestamp"
}
```

### Rules
- Source Window: dropdown — 30 / 60 / 90 / 120 minutes (no other values allowed)
- Hot Games Count: dropdown — 3 to 10 (no other values allowed)
- Time Mapping: operator-defined per rank (Hot 1, Hot 2, ..., Hot N).
  Must be in strictly ascending order. Inline red warning + save blocked if not ascending.
  Row count always equals Hot Games Count.
- Output: 1 post containing all ranked games (not separate posts)
- Each game includes: game icon, provider icon, game name
- Draft creation: immediate after a scan returns a valid snapshot (no delay)
- Sample count: N draft samples
- Deduplication by scan timestamp

### Frozen Snapshot
When the API scan returns the ranked Hot Games batch, that snapshot is frozen and pinned
to the resulting drafts via Post.generation_context_json. When a Hot Games draft is
resent from Content Queue for refinement, the same snapshot is reused — the system does
NOT scan the API again and does NOT replace the games list with a new batch.

Snapshot shape stored on the post:
```json
{
  "type": "hot_games_snapshot",
  "scan_timestamp": "2026-04-18T16:00:00Z",
  "source_window_minutes": 120,
  "ranked_games": [ { "rank": 1, "name": "...", "provider": "...", "icon_url": "..." }, ... ],
  "time_mapping": ["18:00", "19:00", ...]
}
```

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
