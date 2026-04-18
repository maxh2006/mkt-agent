# 02-data-model.md

## Database Approach

Use PostgreSQL + Prisma.
Keep schema simple.
Use normalized tables for core entities.
Use JSON fields only for flexible config sections.

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
- rule_type (running_promotion, big_win, educational)
- enabled
- config_json (V2 for big_win: { api_url, default_rule, custom_rule_enabled, custom_rule })
- created_at
- updated_at

Note: big_win config_json uses V2 shape with default_rule/custom_rule structure.
Old shape (approval_required, auto_post, cooldown_minutes, value_display) is migrated at render time.

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
