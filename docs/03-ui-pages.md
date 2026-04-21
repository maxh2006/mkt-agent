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

Columns:
- Brand (All Brands mode), Thumbnail, Preview, Status, Type, Platform, **Schedule**, Scheduled, Created, Actions.
- Schedule column replaces the old Recurrence column and shows window + cadence:
  - `"Apr 1 – Apr 30 • Daily 3:00 PM"` (event with posting instance)
  - `"Apr 1 – Apr 30 • Generate Now • One-time"` (event in Generate Now mode)
  - `"Always-on • Big Win automation"` / `"Always-on • Hot Games scan"` (long-running rule-based drafts)
  - `"—"` otherwise
- Type filter now includes **Hot Games** in addition to Running Promotion / Big Win / Adhoc Event / Educational.
- Sample group chip appears in the preview cell when sibling drafts share a `sample_group_id`
  (e.g. "Sample 1/3"). Siblings also share a thin colored left border for subtle visual grouping.

Edit modal (renamed to "Refine Post"):
- Locked Context panel at the top shows source type, event title (if applicable), schedule summary,
  Hot Games snapshot summary (if applicable), and a source-specific reminder.
- Instruction textarea + universal note: "You may refine visual style, tone, and presentation.
  Fixed rules, reward, timing, and source context will remain unchanged."
- CTA renamed to "Apply Refinement".

Post detail:
- Source ID links to the source event for event-derived posts.
- Rejection block now shows rejected_at timestamp and rejected_by (in addition to reason).

Row actions (target model — refine per implementation):
- Core (visible): View, Refine, Approve (or Approve & Post when immediate), Reject
- Secondary / overflow: View Delivery, Retry Failed, Audit History (later)
- Destructive actions never fire silently from a dropdown — confirm where needed.

Delivery Status modal:
- Opened via the "View Delivery" row action (Send icon) — shown when the post has
  entered the delivery lifecycle (scheduled / publishing / posted / partial / failed).
- Shows one row per delivery with: platform, delivery status chip, scheduled time,
  publish attempted time, posted_at / external_post_id on success, last_error /
  retry_count on failure.
- Retry button appears per failed row. A "Retry All Failed" footer button appears
  when more than one delivery has failed.
- Retry resets a delivery to `queued` and bumps `retry_count`. It reuses the same
  approved content payload — no regeneration, no re-approval.
- When no delivery rows exist yet (post freshly scheduled, Manus hasn't dispatched),
  the modal shows an informational empty state.

Approval UX:
- **Approved is not a visible status.** The Approve action records approval
  metadata (`approved_at`, `approved_by`) and transitions the post straight to
  **Scheduled**. If no `scheduled_at` was pre-set, approval uses `now()` as the
  publish time.
- Status filter no longer offers "Approved". Visible statuses:
  Draft / Pending Approval / Scheduled / Publishing / Posted / Partial / Rejected / Failed.

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
- C. Posting Schedule — frequency: Generate Now / Daily / Weekly / Monthly. "Generate Now" hides recurrence controls and auto-generate toggle (it is the explicit intent).
- D. Auto-generate toggle (hidden in Generate Now mode)

Right-side panel on the Create page: **Sample Event Brief** — reference-only guidance.
Shows 8 rows (Theme, Objective, Rules, Reward, Target Audience, CTA, Tone, Notes for AI)
pulled from a hardcoded list of coherent example briefs. A "Generate Sample Prompt" button
picks a new example on each click. The panel does NOT fill any real form fields;
operators type their own values. Required field enforcement is unchanged.

On the Create page, the primary button label is "Create Event & Generate Drafts Now" when Generate Now is selected; otherwise "Create Campaign Event". Submitting with Generate Now creates the event and immediately triggers draft generation into Content Queue for review.

Detail page shows all sections with inline editing. "Generate Drafts" button creates shell posts in Content Queue from the posting schedule.

Event statuses: active, ended, archived (no draft). Lifecycle auto-managed.

### Automation Rules
Rules-only configuration page with 3 tabs:
- **Big Wins** — batch snapshot mode, check frequency, draft cadence, default/custom rules,
  username masking, content output rules, deduplication
- **On Going Promotions** — API-based promo detection, weekly check schedule, per-promo rule
  creation with posting mode (start/daily/weekly/monthly), recurrence config, draft delay
- **Hot Games** — top RTP games from source window, fixed time mapping (6-11 PM),
  single-post output containing all ranked games, scan deduplication
All matched rules create drafts in Content Queue for operator review.

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
