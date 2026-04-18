# 03-ui-pages.md

## UI Goal

Desktop-first operator dashboard.
Simple, fast, preview-heavy, multi-brand aware.

---

## Global Layout

### Top Bar
- logo
- brand switcher
- global search
- notifications
- user menu

### Sidebar
- Overview
- Content Queue
- Calendar
- Events
- Automation Rules
- Templates & Assets
- Insights
- Channels
- Brand Management
- Users & Roles
- Audit Logs

---

## Page Definitions

### Overview
Show:
- pending approval
- scheduled today
- posted today
- failed posts
- active automations
- recent warnings

### Content Queue
Main working page.

Columns include Recurrence (shows posting schedule for event-derived posts).
Edit modal detects event-derived posts and shows event context banner with constraint note.
Post detail links Source ID to the source event for event-derived posts.

Filters:
- brand
- status
- platform
- post type
- date
- source

Actions:
- preview
- edit
- approve
- reject
- regenerate
- duplicate
- archive

### Post Detail / Preview
Show:
- headline
- caption
- CTA
- banner text
- image prompt
- source data
- brand/platform preview

Actions:
- save draft
- approve
- approve and schedule
- reject
- regenerate copy
- regenerate banner idea

### Calendar
Day/week/month views for scheduled posts.

### Events (Campaign Briefs)
Structured form for adhoc campaigns. Events are AI-ready campaign briefs.

Create form includes:
- A. Event Details — title, type, theme, dates, objective, rules, reward
- B. Campaign Brief — target audience, CTA, tone, platform scope, notes for AI
- C. Posting Schedule — frequency (daily/weekly/monthly), time, day selection, recurrence preview
- D. Auto-generate toggle

Detail page shows all sections with inline editing. "Generate Drafts" button creates shell posts in Content Queue from the posting schedule.

Event statuses: active, ended, archived (no draft). Lifecycle auto-managed.

### Automation Rules
Big Win rule configuration page (rules only, not content generation/preview/publishing).
Sections: Big Win API URL, Default Rule (payout OR multiplier threshold), Custom Rule
(payout/multiplier ranges with display increase %), Username Display (masking preview),
Rule Result Explanation (live sample evaluation), Content Queue Flow Notice.
All matched wins create drafts in Content Queue for review.

### Templates & Assets
Brand assets, reusable templates, prompts, CTAs.

### Insights
Lightweight internal metrics only.

### Channels
Per-brand account connections and status.

### Brand Management
Admin-only module. Shows a list of all brands with search and active/inactive filter.
Each brand card shows: name, active status, domain, API base URL, integration badge, color swatches, last updated.
"Add Brand" and "Edit" open a tabbed form dialog with five sections:
- A. Identity — name, domain, logo_url, primary/secondary/accent colors, active toggle
- B. Integration — integration_enabled, api_base_url, external_brand_code, big_win_endpoint, promo_list_endpoint, tracking_link_base, hot_games_endpoint, notes
- C. Voice & Tone — tone, cta_style, language_style, taglish_ratio, emoji_level, banned_phrases, default_hashtags
- D. Design — design_theme_notes, preferred_visual_style, headline_style, button_style, promo_text_style, color_usage_notes
- E. Sample Captions — repeater of { title, type, text, notes }

Admin role only can create or edit brands. Non-admin roles are read-only (Brand Management page not shown in nav for non-admins — accessed via brand switcher only).

### Users & Roles
Simple role assignment with brand scope.

### Audit Logs
Track critical changes.

---

## UI Rules

- Always show current brand clearly
- Use structured inputs
- Keep operator actions obvious
- Use status badges and filters
- Show previews before approval
- Avoid hidden workflows
