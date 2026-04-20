# 02-data-model.md

## Database Approach

Use PostgreSQL + Prisma.
Keep schema simple.
Use normalized tables for core entities.
Use JSON fields only for flexible config sections.

---

## External Tables (read-only, sourced from platform BigQuery)

Schema is owned by the platform team. These are the BigQuery tables we read from
for automation scans. Sync: hourly at :00 GMT+8. PII removed.

- `shared.users` — id, brand_id, level, tags, country_code, telco, channel,
  balance, total_deposit, total_withdrawal, deposit_count, withdrawal_count,
  is_active, last_login_at, created_at, updated_at.
  `username` is a display handle (not PII) — pending platform team confirmation.
  Multi-brand: same username can exist across brands; identity is `(username, brand_id)`.

- `shared.transactions` — user_id, type (deposit|withdrawal), status (always "completed"),
  amount, balance_before, balance_after, created_at, finalized_at.
  Wallet movements only. Game betting is in `shared.game_rounds`.

- `shared.game_rounds` — user_id, brand_id, game_code, category,
  bet_amount, payout_amount, ggr, valid_bet, win_multiplier (pre-computed integer),
  status (pending|settled|refunded|reclaimed), bet_at, settled_at.

- `shared.games` — id, vendor, tg_game_code, tg_game_provider,
  name, display_name, category, rtp, game_icon (public URL), is_active.

Schema is evolving — all column references in our code are centralized in a single
adapter module (`src/lib/bq/shared-schema.ts`, to be created when query layer lands)
so renames can be absorbed in one place.

---

## Core Tables

### brands
- id
- name
- logo_url
- primary_color
- secondary_color
- accent_color
- domain
- active
- settings_json (legacy, kept for compat)
- integration_settings_json — api_base_url, external_brand_code, big_win_endpoint, promo_list_endpoint, tracking_link_base, hot_games_endpoint, integration_enabled, notes
- voice_settings_json — tone, cta_style, language_style, taglish_ratio, emoji_level, banned_phrases, default_hashtags
- design_settings_json — design_theme_notes, preferred_visual_style, headline_style, button_style, promo_text_style, color_usage_notes
- sample_captions_json — array of { id, title, type, text, notes }
- created_at
- updated_at

### users
- id
- name
- email
- role
- active
- created_at
- updated_at

### user_brand_permissions
- id
- user_id
- brand_id
- role

### posts
- id
- brand_id
- post_type
- platform
- status
- headline
- caption
- cta
- banner_text
- image_prompt
- source_type
- source_id
- source_instance_key (occurrence datetime key for event-derived posts)
- generation_context_json (per-draft automation context — e.g. frozen Hot Games snapshot)
- tracking_id
- scheduled_at
- posted_at
- created_by
- approved_by
- created_at
- updated_at

### events
- id
- brand_id
- event_type
- title
- objective
- rules
- reward
- start_at
- end_at
- theme
- status (active, ended, archived)
- created_by
- target_audience
- cta
- tone
- platform_scope (JSON array of platform strings)
- notes_for_ai
- posting_instance_json (JSON: { frequency, time, weekdays?, month_days? })
- auto_generate_posts (boolean, default false)
- created_at
- updated_at

### automation_rules
- id
- brand_id
- rule_name
- rule_type (big_win, running_promotion, hot_games, educational)
- enabled
- config_json (typed per rule_type — see docs/04-automations.md for shapes)
- created_at
- updated_at

Rule types: big_win (Big Wins), running_promotion (On Going Promotions), hot_games (Hot Games), educational (hidden).
Old config shapes migrated at render time by merging with defaults.

### channels
- id
- brand_id
- platform
- account_name
- status
- config_json
- created_at
- updated_at

### templates
- id
- brand_id nullable
- template_type
- name
- active
- config_json
- created_at
- updated_at

### audit_logs
- id
- brand_id
- user_id
- action
- entity_type
- entity_id
- before_json
- after_json
- created_at

---

## Tracking Tables

### click_events
- id
- tracking_id
- brand_id
- platform
- referrer
- user_agent
- created_at

### signup_events
- id
- tracking_id
- user_id
- created_at

### deposit_events
- id
- tracking_id
- user_id
- amount
- created_at

### revenue_events
- id
- tracking_id
- user_id
- ggr_amount
- created_at

### post_metrics_rollup
- id
- post_id
- brand_id
- clicks
- signups
- depositors
- total_deposit
- total_ggr
- updated_at

---

## Enums

### post_status
- draft
- pending_approval
- approved
- scheduled
- posted
- rejected
- failed

### event_status
- active
- ended
- archived

Event lifecycle: active events with passed end_at become ended; ended events 14+ days past end_at become archived. Status normalization applied on reads.

### channel_status
- active
- disconnected
- error
- disabled

---

## Data Rules

- `brand_id` is required on all main business entities
- Store source truth and display output separately when needed
- Keep tracking and rollup tables separate
- Do not mix raw events with summary data
