# WORKLOG.md

## Ongoing Tasks



## Done Tasks

### 2026-04-18
- Task: Hot Games tab refinement — dropdowns, ascending time mapping, frozen snapshot
  - Status: Complete
  - Files changed:
    - prisma/schema.prisma — added Post.generation_context_json (Json?)
    - prisma/migrations/20260418220000_post_generation_context/migration.sql (new) —
      applied successfully to Neon
    - src/lib/validations/automation.ts — hotGamesRuleConfigSchema: source_window_minutes
      as literal union (30/60/90/120), hot_games_count (renamed from top_games_count) as
      literal union (3–10), time_mapping (renamed from fixed_time_mapping) with length
      matching hot_games_count + ascending order refinement, removed draft_delay_minutes.
      Exported HOT_GAMES_SOURCE_WINDOWS and HOT_GAMES_COUNT_OPTIONS constants.
    - src/lib/posts-api.ts — added generation_context_json to Post interface
    - src/app/(app)/automations/page.tsx — Hot Games card rewrite:
      * Source Window → Select dropdown (30/60/90/120)
      * Hot Games Count → Select dropdown (3–10), label renamed from "Top Games Count"
      * Time Mapping → vertical rows, N rows where N = hot_games_count, time Select per row,
        row labels "Hot 1", "Hot 2", ..., inline red warning when not ascending, save blocked
      * Removed draft delay field; added "Drafts are created immediately after a scan" text
      * Added Frozen Snapshot notice at top explaining pinning behavior
      * Summary panel updated with first/last mapped times and snapshot note
      * migrateHotGames migrates old shape (top_games_count → hot_games_count,
        fixed_time_mapping → time_mapping, drops draft_delay_minutes)
      * setHotGamesCount dynamically resizes time_mapping array
    - src/components/posts/edit-post-modal.tsx — Hot Games snapshot banner: when a post
      has generation_context_json with type "hot_games_snapshot", shows amber info box
      with scan timestamp, source window, ranked games count, and note that refinement
      reuses the snapshot without scanning again
    - docs/04-automations.md — new config shape, dropdown caps, ascending mapping, immediate
      drafts, frozen snapshot behavior with example snapshot shape
    - docs/02-data-model.md — added Post.generation_context_json
    - docs/07-ai-boundaries.md — new Hot Games Frozen Snapshot section
  - New Hot Games field behavior:
    - Source Window: dropdown only (30/60/90/120), no free input
    - Hot Games Count: dropdown only (3–10)
    - Time Mapping: operator picks per rank, auto-resizes with count, ascending order enforced
  - Ascending-order warning behavior:
    - Per-row red "Times must be in ascending order." text to the right of offending row
    - handleSave blocks with error if any pair is not ascending
    - Zod schema has matching refine() for server-side validation
  - Snapshot freezing behavior:
    - Post.generation_context_json holds the snapshot { type, scan_timestamp,
      source_window_minutes, ranked_games, time_mapping }
    - Rules page prepares the architecture; actual snapshot write happens at scan-time
      (future AI/generation layer)
  - How Content Queue edits now reuse the same snapshot:
    - Edit modal detects generation_context_json.type === "hot_games_snapshot"
    - Shows a read-only banner with snapshot details and explicit note that refinement
      reuses the snapshot and will not trigger a new scan
  - Docs updated: 04-automations.md, 02-data-model.md, 07-ai-boundaries.md

- Task: Fix Add Rule button on On Going Promotions tab
  - Status: Complete
  - Root cause:
    The addPromoRule handler called crypto.randomUUID() to generate the new rule's id.
    crypto.randomUUID() is a secure-context-only browser API — it is only available on
    HTTPS or localhost. On the deployed server at http://34.92.70.250 (plain HTTP),
    the call threw "TypeError: crypto.randomUUID is not a function", which React
    swallowed silently in the onClick handler — so nothing happened when the operator
    clicked Add Rule. On localhost dev it worked because localhost is a secure context.
  - Files changed:
    - src/lib/client-id.ts (new) — generateClientId() helper. Tries crypto.randomUUID()
      when available, falls back to Date.now() + Math.random() combination for
      non-HTTPS environments. Safe in all contexts.
    - src/app/(app)/automations/page.tsx — imported generateClientId, replaced
      crypto.randomUUID() in addPromoRule handler
  - Verified: TypeScript passes clean. Add Rule will now work on both dev and deployed
    HTTP site. Existing server-side crypto.randomUUID() calls in API routes are
    unaffected (Node.js runtime always supports it).
  - Scope kept tight: no other changes, no schema changes, no other tabs touched.

- Task: Big Wins tab refinement — hourly check, AND/OR logic, custom-rule random usernames
  - Status: Complete
  - Files changed:
    - src/lib/validations/automation.ts — check_frequency now { interval_hours } only (removed
      time). draft_cadence renamed interval_hours → scan_delay_hours. default_rule adds
      logic: "OR" | "AND". Updated DEFAULT_BIG_WIN_RULE_CONFIG.
    - src/lib/username-mask.ts — added generateRandomUsername() (6–8 lowercase alphanumeric)
    - src/app/(app)/automations/page.tsx — Big Wins card updated:
      * Check Frequency: single hourly input + anchor rule helper text
      * Draft Creation Timing: label "Create draft after X hours from scan" (single delay)
      * Default Rule: new Condition logic dropdown (OR/AND), removed $ suffix from payout
      * Custom Rule: removed $ suffix from payout range fields
      * Username Display: removed Generate Sample button. Now shows two paths
        (default rule = source username masked, custom rule = random username masked)
      * Summary panel reflects new wording + default logic
      * migrateBigWin handles old config shape (interval_days/time → interval_hours)
    - docs/04-automations.md — updated config shape + rules to reflect all changes
  - New check frequency behavior:
    - Single "Check every N hours" input (1–168)
    - Anchor: cycle starts at 00:00:00 of rule creation day, repeats at selected interval
    - No separate time field anymore
  - New default rule logic selector:
    - OR (default): draft created if either payout OR multiplier condition is met
    - AND: draft created only if both conditions are met
  - New username behavior for custom rules:
    - Default rule drafts: source username, then masked
    - Custom rule drafts: fresh random username (6–8 chars, lowercase a-z + 0-9), then masked
    - generateRandomUsername() helper in src/lib/username-mask.ts
    - Single reusable maskUsername() still applies in both paths
  - Docs updated: docs/04-automations.md

- Task: Automation Rules — 3-tab page (Big Wins, On Going Promotions, Hot Games)
  - Status: Complete
  - Files changed:
    - src/lib/validations/automation.ts — added hot_games to rule types, expanded BigWinRuleConfig
      with check_frequency, draft_cadence, dedupe_key, content_output_rules. New schemas:
      OnGoingPromotionRuleConfig (check_schedule, promo_rules array, draft_delay) and
      HotGamesRuleConfig (check_schedule, source_window, fixed_time_mapping, sample_count)
    - src/app/api/automations/[id]/route.ts — validation branches for all 3 rule types
    - src/components/ui/checkbox-group.tsx (new) — extracted shared CheckboxGroup component
    - src/app/(app)/automations/page.tsx — full rewrite: 3 tabs with BigWinCard,
      OnGoingPromotionsCard, HotGamesCard. Each has enable toggle, config sections,
      summary panel, Content Queue Flow Notice, dirty detection, save/reset
    - src/app/(app)/events/new/page.tsx — import CheckboxGroup from shared
    - src/app/(app)/events/[id]/page.tsx — import CheckboxGroup from shared
    - docs/04-automations.md, docs/03-ui-pages.md, docs/02-data-model.md — updated
  - Tab structure:
    - Big Wins: API URL, check frequency (every N days + time), draft cadence (hours + sample count),
      default rule (OR logic), custom rule (ranges + display increase), username masking,
      content output rules, deduplication
    - On Going Promotions: API URL, weekly check schedule, Allow Duplicate Rules toggle,
      dynamic promo rules list (Add Rule → promo ID/name, posting mode, recurrence, sample count),
      draft delay
    - Hot Games: API URL, check schedule (Tue/Thu/Sat), source window (120 min), top 6 games,
      fixed time mapping (6-11 PM), 1 post per scan, draft delay (10 min), 2 samples, scan dedupe
  - Key notes:
    - hot_games added as new rule_type — auto-seeded on first brand access
    - running_promotion config migrated from legacy shape at render time
    - CheckboxGroup extracted to src/components/ui/ for reuse across events + automations
    - No Prisma schema changes — config_json handles all 3 shapes

- Task: Automation Rules page — Big Win focused rules configuration
  - Status: Complete
  - Files changed:
    - src/lib/username-mask.ts (new) — maskUsername() helper, first 2 + * middle + last 2
    - src/lib/validations/automation.ts — new BigWinRuleConfig schema (api_url, default_rule,
      custom_rule_enabled, custom_rule with payout/multiplier ranges + increase_pct).
      Old schemas kept for backward compat.
    - src/lib/display-value.ts (deleted) — superseded by new rule structure
    - src/app/api/automations/[id]/route.ts — removed value_display audit, added V2 validation
    - src/app/(app)/automations/page.tsx — full rewrite as "Automation Rules" page with
      6 sections: Big Win API, Default Rule, Custom Rule, Username Display, Rule Result
      Explanation, Content Queue Flow Notice. Only Big Win shown.
    - src/components/layout/sidebar.tsx — label "Automations" → "Automation Rules"
    - src/lib/audit.ts — AUTOMATION_VALUE_DISPLAY_CHANGED moved to legacy
    - docs/03-ui-pages.md, docs/04-automations.md, docs/02-data-model.md — updated
  - New page structure: 6 sections focused on Big Win rule configuration
  - Default rule: OR logic — draft created if payout ≥ threshold OR multiplier ≥ threshold
  - Custom rule: range-based with display increase %. Payout and multiplier sub-rules.
    Validation: min < max. Display adjustments only — source values unchanged.
  - Username masking: first 2 + * middle + last 2. ≤4 chars unchanged.
  - Rule explanation: live computed preview using current form values with sample win data
  - Content Queue flow: explicit notice that matched wins create drafts for review only
  - Key notes:
    - This is a rules config page only — no content generation, preview, or publishing
    - Running Promotion and Educational hidden from UI but data preserved in DB
    - Old config shape migrated at render time via migrateConfig()
    - No Prisma schema changes — config_json is Json type

- Task: Events date/time picker refinement — bounded time selection with proper defaults
  - Status: Complete
  - Scope: UI-only, create + edit event forms
  - Files changed:
    - src/components/events/event-datetime-picker.tsx (new) — shared EventDateTimePicker
      component with split date input + time Select dropdown. 96 time options (15-min intervals
      from 00:00 to 23:45, plus 23:59 for end mode). Exports DEFAULT_START_TIME ("00:00"),
      DEFAULT_END_TIME ("23:59"), splitDatetime(), joinDatetime() utilities.
    - src/app/(app)/events/new/page.tsx — replaced datetime-local inputs with
      EventDateTimePicker. FormData split into start_date/start_time and end_date/end_time.
      Start defaults to 00:00, end defaults to 23:59.
    - src/app/(app)/events/[id]/page.tsx — same replacement in edit mode. EditData and
      initEditData updated. saveEdit uses joinDatetime for ISO conversion.
  - How start time defaults: 00:00 (midnight) via DEFAULT_START_TIME constant
  - How end time defaults: 23:59 via DEFAULT_END_TIME constant
  - How bounded time picker works: Select dropdown with fixed options (15-min intervals),
    no infinite scroll. End mode adds 23:59 PM option. Min 00:00, max 23:59.

- Task: Events Module Upgrade — AI-ready campaign briefs + Content Queue integration
  - Status: Complete
  - Schema changes:
    - EventStatus enum: removed draft, kept active/ended/archived, default changed to active
    - Event model: added target_audience, cta, tone, platform_scope (Json), notes_for_ai,
      posting_instance_json (Json), auto_generate_posts (Boolean)
    - Post model: added source_instance_key (String?) for occurrence tracking
    - Migration: 20260418180000_event_campaign_brief (data-migrated draft→active before enum change)
  - New files:
    - src/lib/event-status.ts — normalizeEventStatus(), normalizeEvent(), normalizeEvents()
      with ARCHIVE_THRESHOLD_DAYS=14. Active→ended if past end_at, ended→archived if 14+ days past.
    - src/lib/posting-instance.ts — PostingInstanceConfig interface, formatPostingInstance(),
      formatPostingInstanceCompact(), formatPostingInstanceWithEnd(), parsePostingInstance(),
      generateOccurrences() with month-day clamping for edge cases
    - src/lib/event-brief-context.ts — EventBriefContext interface, resolveEventBriefContext()
      loads event from DB and formats context for AI refinement
    - src/app/api/events/[id]/generate-drafts/route.ts — POST creates shell Post records per
      occurrence × platform from posting schedule, deduplicates by source_instance_key + platform
    - src/app/api/posts/[id]/event-context/route.ts — GET returns EventBriefContext for a post
  - Modified files:
    - prisma/schema.prisma — EventStatus enum, Event model fields, Post.source_instance_key
    - src/lib/validations/event.ts — removed draft, added postingInstanceSchema, extended
      createEventSchema and updateEventSchema with campaign brief fields
    - src/lib/validations/post.ts — added source_instance_key to createPostSchema
    - src/lib/audit.ts — added EVENT_DRAFTS_GENERATED action
    - src/app/api/events/route.ts — normalizeEvents on GET, status: "active" on POST, new fields
    - src/app/api/events/[id]/route.ts — normalizeEvent on GET, new fields in PATCH audit
    - src/app/api/posts/route.ts — enriches event-sourced posts with event_posting_summary
      and event_title via batch event lookup
    - src/lib/events-api.ts — Event interface expanded, generateDrafts method added
    - src/lib/posts-api.ts — Post interface: source_instance_key, event_posting_summary,
      event_title; added getEventContext method and EventBriefContext type
    - src/app/(app)/events/page.tsx — removed draft from STATUS_COLORS
    - src/app/(app)/events/new/page.tsx — full rewrite as campaign brief form with 3 sections:
      Event Details, Campaign Brief (target_audience/cta/tone/platform_scope/notes_for_ai),
      Posting Schedule (frequency/time/weekday or month-day selection/preview summary)
    - src/app/(app)/events/[id]/page.tsx — full rewrite with Campaign Brief and Posting Schedule
      sections in view/edit mode, Generate Drafts button
    - src/app/(app)/queue/page.tsx — added Recurrence column showing event posting summary
    - src/app/(app)/queue/[id]/page.tsx — Source ID links to /events/[id] for event-derived posts,
      shows occurrence datetime
    - src/components/posts/edit-post-modal.tsx — detects event-derived posts, fetches event
      context, shows info banner with event title and constraint note
    - docs/00-architecture.md, docs/02-data-model.md, docs/03-ui-pages.md,
      docs/06-workflows-roles.md, docs/07-ai-boundaries.md — all updated
  - Event form structure: title, type, theme, dates, objective, rules, reward +
    campaign brief (target_audience, cta, tone, platform_scope, notes_for_ai) +
    posting schedule (daily/weekly/monthly with time + day selection)
  - Recurrence behavior: daily at time, weekly on selected weekdays at time,
    monthly on selected days (with month-day clamping) at time. Preview summary shown in form.
  - Event status lifecycle: active (default) → ended (past end_at) → archived (14+ days past).
    Normalization applied on API reads via shared utility.
  - Event-derived drafts: posts created via Generate Drafts with source_type=event,
    source_id=event.id, source_instance_key=occurrence ISO, post_type=event.
    One post per occurrence × platform.
  - Queue edit constraint: edit modal detects event-derived posts, fetches event brief context
    via /api/posts/[id]/event-context, shows info banner. Event rules and schedule cannot be
    changed from queue — only content refinement.
  - Deferred items:
    - Actual AI content generation (Generate Drafts creates shell posts, no AI calls)
    - Auto-generate cron job (auto_generate_posts flag stored but not wired to scheduler)
    - Edit modal "Apply Edit" remains placeholder for future AI refinement

- Task: Calendar Page refinement — visual distinction + detail dialog
  - Status: Complete
  - Scope: UI-only, single file changed
  - Files changed:
    - src/components/calendar/calendar-post-card.tsx — full rewrite with two improvements
  - How approved vs scheduled styling now differs:
    - Approved cards: emerald-green left border (3px week / 2px month), bg-emerald-500/5 tint,
      hover to bg-emerald-500/10. Status indicator shows CheckCircle2 icon + "Posted" label
      in emerald green.
    - Scheduled cards: amber left border (3px week / 2px month), bg-amber-500/5 tint,
      hover to bg-amber-500/10. Status indicator shows CalendarClock icon + "Scheduled" label
      in amber.
    - Both variants (detailed week cards and compact month cards) use the same color system
      via STATUS_CARD_STYLES config object.
  - How the calendar detail view works:
    - Clicking any calendar card opens a Dialog (shadcn) instead of navigating away.
    - Dialog shows: status indicator with icon, headline as title, thumbnail placeholder
      (ImageIcon), brand dot + name (in all-brands mode), platform badge (full name),
      post type label, posted/scheduled time with icon (green CheckCircle2 for approved,
      amber CalendarClock for scheduled), full caption, CTA, banner text.
    - Time formatting uses full readable format: "Fri, Apr 18, 2026, 10:30 AM".
    - "Open full detail" button at bottom navigates to /queue/[id] for full editing/actions.
  - Key notes:
    - No backend changes
    - No layout, filter, or navigation changes
    - Dialog uses existing shadcn Dialog component
    - Each card manages its own dialog open state via useState

- Task: Calendar Page — visual planner for approved + scheduled posts
  - Status: Complete
  - Scope: Backend extension + full calendar frontend (no external calendar library)
  - Files changed:
    - src/lib/validations/post.ts — added statuses (comma-separated), date_from, date_to params
      to listPostsQuerySchema; raised per_page max from 100 → 200
    - src/app/api/posts/route.ts — multi-status filter (status: { in: [...] }), date range OR
      filter (approved → posted_at/updated_at, scheduled → scheduled_at), added primary_color
      to brand select
    - src/lib/posts-api.ts — extended BrandRef with primary_color, PostFilters with statuses/
      date_from/date_to, updated buildPostsUrl
    - src/lib/calendar-utils.ts (new) — getWeekRange, getMonthRange, getDaysInRange,
      getPostDate, groupPostsByDate, formatCardTime, isToday, isSameMonth, formatDateRangeLabel
    - src/components/calendar/calendar-post-card.tsx (new) — detailed (week) and compact (month)
      variants; shows time, platform tag, status badge, brand dot + name (all-brands mode),
      headline/caption truncated; click navigates to /queue/[id]
    - src/components/calendar/calendar-week-view.tsx (new) — 7-column CSS grid (Mon–Sun),
      day header with today highlight (primary circle), scrollable columns, min-h-[500px]
    - src/components/calendar/calendar-month-view.tsx (new) — 7-column month grid, min-h-[120px]
      cells, compact cards, +N more overflow button with expand/collapse, outside-month muting
    - src/app/(app)/calendar/page.tsx — full rewrite from stub; week/month toggle, prev/next/today
      navigation, date range label, 3 filters (platform, post_type, status), data fetching via
      TanStack Query, loading/error/empty states
  - How approved vs scheduled posts are handled:
    - "approved" = already posted; calendar shows posted_at time (falls back to updated_at if null)
    - "scheduled" = future posting; calendar shows scheduled_at time
    - API date range filter uses OR clause mapping each status to its relevant date field
    - Status filter on calendar only offers: All, Approved (Posted), Scheduled
  - How All Brands mode behaves:
    - Shows posts from all accessible brands
    - Each card displays brand color dot (uses primary_color from Brand, falls back to
      deterministic hash) + brand name
    - Single brand mode hides brand info on cards
  - How platform icons and timestamps are rendered:
    - Platform: compact 2-letter abbreviation tags (IG/FB/TW/TK/TG) with platform-specific colors
    - Timestamps: formatted as "10:30 AM" style using native Date.toLocaleTimeString
    - Week view: detailed cards with time, platform, status, brand, headline
    - Month view: single-line compact cards with time + platform + headline snippet
  - Key notes:
    - No external calendar library — custom CSS grid with Tailwind
    - No drag-and-drop
    - No new Prisma schema changes
    - Backend changes are backward-compatible (existing queue page unaffected)
    - Calendar uses separate query key ["calendar-posts"] to avoid cache conflicts with queue

### 2026-04-15
- Task: Content Queue — table refactor + prompt-based edit modal
  - Status: Complete
  - Scope: UI-only, no backend changes
  - Files changed:
    - src/components/posts/status-badge.tsx — added per-status lucide icons (FileEdit, Clock,
      CheckCircle2, CalendarClock, SendHorizontal, XCircle, AlertTriangle); badge now renders
      icon + label with gap-1 whitespace-nowrap
    - src/components/posts/edit-post-modal.tsx (new) — Dialog showing current content sections
      (Headline, Caption, CTA, Banner Text, Image Prompt), instruction textarea, "Apply Edit"
      button (placeholder — AI logic wired in a future step); shows feedback message on apply
    - src/app/(app)/queue/page.tsx — full table rewrite:
        • Column order: Brand (all-brands only) | Thumbnail | Preview | Status | Type | Platform
          | Scheduled | Created | Actions
        • ThumbnailCell: 40×40 rounded square, platform abbreviation + color (IG/FB/TW/TK/TG)
        • Preview: headline (bold) + caption (muted) truncated; creator name as tertiary line
        • StatusBadge: now includes icon (imported from updated status-badge.tsx)
        • PostTypeTag: compact colored border badge (Promo/Win/Event/Edu)
        • PlatformTag: compact 2-letter abbreviation with platform color
        • BrandCell: deterministic color dot per brand name + truncated name
        • Scheduled: "Today, 2:30 PM" / "Tomorrow, 2:30 PM" / "Apr 12, 2:30 PM" / "—"
        • Created: short date (Apr 12), xs size, lower opacity; hidden on xs screens
        • Actions: View (Eye), Edit (Pencil, draft/pending/rejected), Approve (✓), Reject (✗),
          Schedule (CalendarClock) — same role/status guards as before
        • EditPostModal wired: clicking Edit sets editPost state, modal opens over the table
        • Table: overflow-x-auto + min-w-[860px], responsive hidden columns on mobile
  - Key notes:
    - Edit modal "Apply Edit" is a placeholder — instruction is shown as saved but no API call
    - Thumbnail uses platform color/abbr as visual placeholder (no image_url on Post type yet)
    - Brand dot color is deterministic hash of brand name (no primary_color in BrandRef)
    - No backend changes — all changes are UI-only


- Task: UI Refinement Batch 1 — Global UI + Brand Switch polish
  - Status: Complete
  - Changes:
    - src/app/layout.tsx — switched font from Geist to Roboto (300/400/500/700 weights,
      --font-roboto CSS variable via next/font/google)
    - src/app/globals.css — full theme update to Meta Business Suite palette:
        • primary → oklch(0.52 0.22 258) ≈ #1877F2 (Facebook blue) with white foreground
        • muted/secondary → oklch(0.962 0.004 260) ≈ #F0F2F5 (Facebook light gray)
        • border/input → oklch(0.899 0.004 260) ≈ #DADDE1 (subtle gray border)
        • ring → blue (matches primary)
        • --font-sans mapped to --font-roboto
        • radius reduced to 0.5rem (slightly tighter)
    - src/components/layout/shell.tsx — converted to client component; manages
      sidebarOpen state; renders mobile backdrop overlay
    - src/components/layout/sidebar.tsx — responsive: fixed+translate-x on mobile
      (slides in/out), md:relative always visible on desktop; nav links close sidebar on mobile
    - src/components/layout/topbar.tsx — added onMenuClick prop; hamburger Menu button
      visible only on mobile (md:hidden) in top-left
    - src/app/(app)/queue/page.tsx — wrapped table in overflow-x-auto + min-w-[720px]
      to prevent column squishing on narrow viewports
    - src/app/(app)/events/page.tsx — same pattern, min-w-[560px]
  - Brand dropdown: no changes needed — correctly implemented in previous session
    (fetches from /api/brands, cookie-based active brand, All Brands mode, query invalidation)

- Task: All Brands mode — default dashboard view + per-brand optional selection
  - Status: Complete
  - Architecture:
    - Cookie value "all" = all-brands mode; specific brand_id = single-brand mode
    - On login / missing cookie → defaults to "all"
    - Invalid brand_id in cookie → falls back to "all"
    - getActiveBrand() now always returns ActiveBrandContext (never null)
    - ctx.brandIds: admin = all active brands, others = UserBrandPermission records
    - Read routes: filter by brand_id: { in: ctx.brandIds } (works for both modes)
    - Write routes: require ctx.mode === "single" → REQUIRES_SINGLE_BRAND (409)
    - ctx.brand! non-null assertion safe after mode guard (TypeScript pattern)
  - Files changed:
    - src/lib/active-brand.ts — new ActiveBrandContext type, getActiveBrand always returns context
    - src/lib/active-brand-client.ts — new useActiveBrand() hook (shares ["active-brand"] query key)
    - src/lib/api.ts — REQUIRES_SINGLE_BRAND error added
    - src/lib/posts-api.ts — Post.brand?: BrandRef added; PostsPage.mode? added
    - src/lib/events-api.ts — Event.brand?: EventBrandRef added; EventsPage.mode? added
    - src/app/api/brands/active/route.ts — GET returns { mode, brand }; POST accepts "all"
    - src/app/api/posts/route.ts + [id]/route.ts + approve/reject/schedule — brandIds + mode guard
    - src/app/api/events/route.ts + [id]/route.ts — brandIds + mode guard
    - src/app/api/channels/route.ts + [id]/route.ts — brandIds + mode guard; GET includes brand
    - src/app/api/automations/route.ts — all-brands mode skips seeding, queries across brandIds
    - src/app/api/automations/[id]/route.ts — mode guard
    - src/app/api/templates/route.ts + [id]/route.ts — brandIds in OR filter for globals; mode guard
    - src/app/api/audit-logs/route.ts — brandIds filter
    - src/app/api/insights/route.ts — brandIds across all queries
    - src/components/layout/topbar.tsx — "All Brands" as first option, Layers icon, mode-aware display
    - src/app/(app)/queue/page.tsx — brand column in all-brands mode, dead isNoBrand removed
    - src/app/(app)/events/page.tsx — brand column + disabled "New Event" in all-brands mode
  - Key notes:
    - Automations seeding skipped in all-brands mode (can't seed across N brands at once)
    - Templates global OR filter: brand_id IN brandIds OR brand_id IS NULL
    - useActiveBrand() uses staleTime 30s and shares cache with topbar — no extra fetch

- Task: Brand dropdown — strict DB source, active brand display, auto-select, query sync
  - Status: Complete
  - Files changed:
    - src/app/api/brands/active/route.ts — added GET handler: reads cookie, validates
      brand is active + user has access, returns { id, name, primary_color } or null
    - src/components/layout/topbar.tsx — full refactor:
        • queries ["active-brand"] via GET /api/brands/active (staleTime 30s)
        • button shows active brand name (with color dot) instead of always "Select Brand"
        • dropdown highlights selected brand with bg-muted + Check icon
        • auto-selects the only brand on first load (useRef guard prevents loop)
        • detects if active brand is no longer in accessible list → switches to first brand
        • on switch: invalidates ["active-brand"] immediately, marks all queries stale,
          calls router.refresh() for server components
        • "Loading..." shown briefly while active-brand query is settling
    - src/app/(app)/brands/page.tsx — invalidate() now also invalidates
      ["brands-switcher"] and ["active-brand"] so topbar updates after brand create/edit
  - Data source: GET /api/brands?active=true — admin sees all active brands, non-admin
    sees only brands they have a UserBrandPermission record for
  - No schema changes, no new tables


- Task: VPS Deployment — Ubuntu + PM2 + Nginx + Cloudflare
  - Status: Deployment config complete. Awaiting live VPS credentials to execute.
  - Architecture: Ubuntu VPS / Node.js 22 LTS / PM2 / Nginx (port 80) / Cloudflare Flexible SSL
  - Files created and committed:
    - `.env.production.example` — env template (force-added past .gitignore)
    - `ecosystem.config.js` — PM2 app config, app at /opt/mkt-agent port 3000
    - `nginx/mkt-agent.conf` — reverse proxy; passes X-Forwarded-Proto from Cloudflare
    - `scripts/server-setup.sh` — one-time Ubuntu bootstrap (Node, PM2, Nginx, clone, firewall)
    - `scripts/deploy.sh` — git pull + npm install + prisma generate + migrate deploy + build + pm2 reload
  - Required env vars on server:
    - DATABASE_URL — Neon connection string
    - AUTH_SECRET — openssl rand -base64 32
    - AUTH_TRUST_HOST=true
    - NODE_ENV=production
  - Cloudflare DNS: A record dev → VPS IP, orange cloud proxied, SSL/TLS mode: Flexible
  - App directory on server: /opt/mkt-agent
  - PM2 process name: mkt-agent
  - Key notes:
    - src/generated/prisma is gitignored — prisma generate MUST run before every build
    - proxy.ts already handles x-forwarded-host + x-forwarded-proto (Cloudflare-safe)
    - trustHost: true is already set in src/auth.ts
    - bootstrap: curl .../scripts/server-setup.sh | bash (once on fresh server)
    - redeploy: cd /opt/mkt-agent && bash scripts/deploy.sh
  - Next: SSH into VPS and run bootstrap + deploy when credentials available

### 2026-04-14
- Task: Brand Management module (replaces Brand Settings)
  - Status: Complete
  - Notes: Merged Brand Settings into a new admin-level Brand Management module.
    Schema: Added secondary_color, accent_color, integration_settings_json, voice_settings_json,
    design_settings_json, sample_captions_json to Brand model. Legacy settings_json kept for compat.
    Migration applied: 20260414151327_brand_management.
    Validations in src/lib/validations/brand.ts: brandIdentitySchema, integrationSettingsSchema,
    voiceSettingsSchema (with tone, language_style replacing old app_link fields), designSettingsSchema,
    sampleCaptionSchema. createBrandSchema / updateBrandSchema combine all sections.
    Removed fields: signup_endpoint, deposit_endpoint, revenue_endpoint (never existed), app_link_ios/android/web
    (removed from voice — not in new spec).
    Audit actions added: BRAND_CREATED, BRAND_UPDATED, BRAND_ACTIVATED, BRAND_DEACTIVATED,
    BRAND_INTEGRATION_CHANGED (legacy BRAND_SETTINGS_UPDATED kept for existing log entries).
    API: GET /api/brands (all roles — admin sees all, others see accessible brands; used by topbar switcher);
    POST /api/brands (admin only); GET /api/brands/[id] (admin only); PATCH /api/brands/[id] (admin only).
    Note: /api/brands/active routes unchanged (cookie management).
    Client helper: src/lib/brands-api.ts — list, get, create, update.
    Page: src/app/(app)/brands/page.tsx — brand list with search + active/inactive filter. Each card
    shows name, status badge, domain, API base URL, integration badge, color swatches, last updated.
    "Add Brand" / "Edit" open a tabbed dialog with 5 sections: Identity, Integration, Voice & Tone,
    Design, Sample Captions. Admin-only writes; list visible to all.
    Topbar: PLACEHOLDER_BRANDS removed; now fetches real brands via brandsApi.list({ active: "true" }).
    Brand switcher shows color dot per brand.
    Nav: "Brand Settings" → "Brand Management", route /brand-settings → /brands.
    Deleted: src/app/(app)/brand-settings/, src/app/api/brand-settings/, src/lib/brand-settings-api.ts,
    src/lib/validations/brand-settings.ts.
    TypeScript clean (also fixed pre-existing trigger prop type errors in reject-dialog + schedule-dialog).
    Docs updated: CLAUDE.md, docs/02-data-model.md, docs/03-ui-pages.md, docs/06-workflows-roles.md.
  - API surface:
    - GET    /api/brands         — list accessible brands (all roles)
    - POST   /api/brands         — create brand (admin only)
    - GET    /api/brands/[id]    — get full brand record (admin only)
    - PATCH  /api/brands/[id]    — update brand (admin only)
  - Key notes:
    - Admin creates/edits brands; brand_manager/operator/viewer are read-only on this module
    - integration_settings_json replaces entire blob on PATCH (not deep-merged)
    - voice_settings_json and design_settings_json same — full replacement per section
    - sample_captions_json is an array; each item has a client-generated id for list management
    - No live API sync, test connection, or secrets management in this MVP iteration

### 2026-04-12
- Task: Add rejected_reason to Post
  - Status: Complete
  - Notes: Added rejected_reason (String?) to Post model in schema.prisma; ran prisma generate.
    Reject route (src/app/api/posts/[id]/reject/route.ts): now writes rejected_reason directly
    instead of prefixing cta with "[Rejected] reason".
    posts-api.ts Post interface: added rejected_reason: string | null.
    Post detail page (queue/[id]/page.tsx): removed parseRejectionReason() helper and REJECT_PREFIX
    constant entirely; rejection reason banner now reads post.rejected_reason directly; CTA field
    displays post.cta without any special-casing; PostPreview overrideCta prop removed.
    TypeScript passes clean. No other logic changed.

- Task: Audit Logs & Final Polish
  - Status: Complete
  - Notes: GET /api/audit-logs — brand-scoped, paginated (50/page), filterable by action,
    entity_type, date_from, date_to (ISO date strings; date_to is extended to end-of-day).
    All roles can read their accessible brand's logs.
    Client helper in src/lib/audit-logs-api.ts: list(params).
    Audit Logs page (src/app/(app)/audit-logs/page.tsx): filter bar (action select, entity_type
    select, date range inputs), Apply/Clear buttons, entry count. Table rows show timestamp
    (Asia/Manila), user name, action badge (color-coded by category), entity_type, entity_id.
    Expandable detail rows (click to expand) show before/after JSON in side-by-side panels.
    Loading skeleton, empty state, no-active-brand state.
    TypeScript fix: shadcn Select onValueChange types v as string|null — guarded with !v check.

  - Permission audit (final):
    - All routes: auth() + sessionUser() → 401 if unauthenticated ✓
    - All routes: getActiveBrand() → 403 if no active brand or no permission ✓
    - Read endpoints (GET): all roles allowed; no additional guard needed ✓
    - Create/Edit (posts, events): assertCanEdit() — viewer blocked ✓
    - Approve/Reject/Schedule: assertCanApprove() — only brand_manager+ ✓
    - Channels/Automations/BrandSettings/Templates (write): assertCanApprove() ✓
    - Post edits: status guard enforced (draft/rejected only) ✓
    - Post schedule: future-only validation enforced ✓
    - Status transitions: isValidTransition() enforced on approve/reject/schedule ✓

  - Multi-brand audit (final):
    - All DB queries filter by brand_id: ctx.brand.id (resolved from cookie, not from client) ✓
    - getActiveBrand validates cookie → DB → user permission — admin bypasses permission table ✓
    - Templates: global templates (brand_id=null) are returned on read, immutable via API ✓
    - Audit logs, insights, channels, events, automations all use ctx.brand.id ✓
    - No cross-brand leaks found ✓

  - API surface:
    - GET /api/audit-logs  — brand-scoped, paginated audit log (all roles)

  - Key notes:
    - Viewer role is fully read-only — no UI mutation paths exist outside the gated components
    - Operator can create posts and events but cannot approve/reject/schedule
    - brand_manager can do everything except cross-brand access (that's admin only)
    - Global templates can only be seeded via DB migration — no API write path

- Task: Templates & Assets module
  - Status: Complete
  - Notes: No schema changes — Template model was already correct (brand_id nullable, template_type
    String, name, active, config_json, created_at, updated_at).
    Validation in src/lib/validations/template.ts: TEMPLATE_TYPES (caption|banner|prompt|cta|asset),
    ASSET_TYPES (image|logo|banner), textTemplateConfigSchema (content + notes),
    assetConfigSchema (url + asset_type + notes), createTemplateSchema (discriminatedUnion on
    template_type), updateTemplateSchema, listTemplatesQuerySchema.
    Three audit actions added to audit.ts: TEMPLATE_CREATED, TEMPLATE_UPDATED, TEMPLATE_TOGGLED.
    API: GET /api/templates (brand + optional global, filterable by type/active);
    POST /api/templates (brand_manager+, creates for active brand);
    GET /api/templates/[id] (all roles, brand or global);
    PATCH /api/templates/[id] (brand_manager+, own-brand only — global templates read-only,
    config merged/validated against existing template_type).
    Client helper in src/lib/templates-api.ts: list, get, create, update.
    Templates & Assets page (src/app/(app)/templates/page.tsx): tab navigation (Captions,
    Banner Text, Image Prompts, CTA Snippets, Assets) with per-tab count badges.
    Each tab: grid of TemplateCards, TemplateFormDialog for create/edit, inline
    activate/deactivate toggle. Duplicate button available to all roles (operator+).
    Global templates shown with "Global" badge and no edit/toggle controls.
    Inactive templates shown with "Inactive" badge and reduced opacity.
    TypeScript passes clean (Zod v4 fix: z.record(z.string(), z.unknown()), z.boolean().default()).
  - API surface:
    - GET    /api/templates      — list templates (brand + global, all roles)
    - POST   /api/templates      — create template (brand_manager+)
    - GET    /api/templates/[id] — get single template (all roles)
    - PATCH  /api/templates/[id] — update template (brand_manager+, own-brand only)
  - Key notes for next session:
    - Global templates (brand_id = null) are read-only in the API — seed them via DB migration only
    - Duplicate in UI pre-fills the create form with the source template's content; saves as a new
      brand-scoped template (not a copy of global)
    - No delete endpoint — deactivate via active toggle to preserve audit trail
    - template_type is immutable after creation (enforced: PATCH does not accept template_type)
    - Next step: Audit Logs & Final Polish (Step 10 of build order)

- Task: Lightweight Insights module
  - Status: Complete
  - Notes: No new schema changes required — PostMetricsRollup, ClickEvent, SignupEvent,
    DepositEvent, and RevenueEvent were already in the schema.
    GET /api/insights?period= (today | last_7_days | last_30_days) — all roles, brand-scoped.
    Operational metrics (generated/approved/rejected/published) queried from Post table filtered
    by created_at in period. Attribution metrics (clicks, signups, depositors, total_deposit,
    total_ggr) aggregated from raw event tables filtered by created_at in period. Depositors
    computed via groupBy(user_id) to get unique count. Top content (top 5 by clicks, deposit, GGR)
    pulled from PostMetricsRollup — all-time, brand-scoped (rollup is cumulative, no period filter).
    Decimal type used structural typing ({ toFixed }) to avoid runtime library import issues.
    Client helper in src/lib/insights-api.ts: get(period).
    Insights page (src/app/(app)/insights/page.tsx): period selector dropdown in header,
    Operational section (4 metric cards), Attribution section (5 metric cards with currency
    formatting in ₱), Top Content section (3 tables: by clicks, deposit, GGR). Loading skeleton,
    no-active-brand state, generic error state. TypeScript passes clean.
  - API surface:
    - GET /api/insights?period=  — brand-scoped insights (all roles)
  - Tightened 2026-04-12:
    - Time boundaries: all period calculations now use Asia/Manila UTC+8 midnight alignment.
      Periods use gte/lt (inclusive start, exclusive end) consistently.
    - Depositors/deposit/GGR: now filter by status="success" only. status field added to
      DepositEvent and RevenueEvent (String @default("success"), values: success | reversed).
    - Indexes added: ClickEvent/SignupEvent @@index([brand_id, created_at]);
      DepositEvent/RevenueEvent @@index([brand_id, created_at]) + @@index([brand_id, status, created_at]);
      PostMetricsRollup @@index([brand_id]).
    - Top content section labeled "All-time (cumulative)" in UI.
    - rollup_last_updated (ISO string) returned in API response; displayed as "Last updated: …" in UI.
    - top_limit query param added (default 5, max 20) for forward-compatible expansion.
    - period_start/period_end (ISO) returned in API response for client-side debug/verification.
  - Key notes for next session:
    - Operational metrics use created_at for time filtering — not a true state-change timestamp
      (e.g. a post created in period but approved later still counts as approved in that period)
    - Top content is all-time — rollup table has no per-event timestamp
    - No scheduled rollup job yet — PostMetricsRollup must be written by the publishing pipeline
    - Attribution data will be zero until click/signup/deposit events are actually ingested
    - Next step: Templates & Assets (Step 9 of build order)

- Task: Brand Settings module
  - Status: Complete
  - Notes: Added settings_json (Json @default("{}")) to Brand schema; ran prisma generate.
    Updated active-brand.ts to select settings_json and include it in ActiveBrandContext.
    Validation schemas in src/lib/validations/brand-settings.ts: updateBrandCoreSchema,
    brandVoiceSchema (cta_style, taglish_ratio, emoji_level, banned_phrases, default_hashtags,
    app_link_ios/android/web), DEFAULT_BRAND_VOICE, updateBrandSettingsSchema.
    API: GET /api/brand-settings (all roles, re-fetches full brand record);
    PATCH /api/brand-settings (brand_manager+, merges voice into settings_json, coerces
    empty strings to null for optional URL/color fields). Audit action BRAND_SETTINGS_UPDATED.
    Client helpers in src/lib/brand-settings-api.ts: get, update.
    Brand Settings page (src/app/(app)/brand-settings/page.tsx): three SectionCard panels —
    Brand Identity (name, logo_url, primary_color, domain), App Links (ios/android/web),
    Voice & Content Defaults (CTA style, Taglish ratio, emoji level, default_hashtags, banned_phrases).
    Per-section save/reset with dirty detection. TagInput component for arrays. ColorField
    for hex color with native color picker. Viewer/operator read-only; brand_manager/admin edits.
    TypeScript passes clean (prisma generate resolved settings_json type errors).
  - API surface:
    - GET   /api/brand-settings  — get active brand settings (all roles)
    - PATCH /api/brand-settings  — update core fields and/or voice settings (brand_manager+)
  - Key notes for next session:
    - settings_json is a Json column — voice settings are merged (partial update), not replaced
    - assertCanApprove gates PATCH (same as other brand_manager+ routes)
    - DEFAULT_BRAND_VOICE in validations/brand-settings.ts is the canonical fallback
    - Next step: Lightweight Insights (Step 8 of build order)

- Task: Channels module
  - Status: Complete
  - Notes: Added last_sync_at (DateTime?) and last_error (String?) as proper columns to the
    Channel schema — not in config_json, since they are first-class operational fields.
    Three audit actions: channel.created, channel.updated, channel.status_changed (written as
    a separate entry when status changes in a single PATCH, same pattern as events).
    Validation schemas in src/lib/validations/channel.ts: PLATFORMS/CHANNEL_STATUSES/labels
    match Prisma enums exactly. createChannelSchema / updateChannelSchema. Platform is not
    editable after creation — changing it would mean a different account entirely.
    API: GET /api/channels (brand-scoped, ordered by platform then account_name);
    POST /api/channels (brand_manager+); GET+PATCH /api/channels/[id] (brand_manager+ for writes).
    notes stored in config_json.notes — the only free-text config field for MVP.
    Channels page: grouped by platform, card layout, status badge with icon, last_sync_at
    and last_error displayed when present, Create dialog + Edit dialog (inline, no separate page).
    Operator/viewer sees read-only list; brand_manager/admin sees Add Channel + Edit buttons.
    TypeScript passes clean.
  - API surface:
    - GET    /api/channels       — list channels for active brand
    - POST   /api/channels       — create channel (brand_manager+)
    - GET    /api/channels/[id]  — get single channel
    - PATCH  /api/channels/[id]  — update channel (brand_manager+)
  - Key notes for next session:
    - platform is immutable after creation (enforced in UI; API does not accept platform in PATCH)
    - last_sync_at and last_error are DB columns — future publishing jobs write there directly
    - No OAuth, token refresh, or live API integration — deferred out of MVP scope
    - CHANNEL_CONNECTED / CHANNEL_DISCONNECTED in audit.ts are now superseded by
      CHANNEL_CREATED / CHANNEL_STATUS_CHANGED — the old constants can be cleaned up later
    - Next step: Lightweight Insights (Step 8 of build order)


- Task: Automations module
  - Status: Complete
  - Notes: Three audit actions added (automation.created, automation.updated,
    automation.value_display_changed — written as separate entries when a single PATCH changes
    both fields and value_display in big_win).
    Config types + schemas in src/lib/validations/automation.ts: explicit typed interfaces for
    RunningPromotionConfig, BigWinConfig, EducationalConfig, ValueDisplayConfig. Per-rule Zod
    schemas validate each config on write. computeDisplayValue + formatDisplayValue utility
    functions for the live preview UI.
    GET /api/automations seeds three default AutomationRule records (running_promotion, big_win,
    educational) on first access for a brand — idempotent, brand-scoped.
    PATCH /api/automations/[id] merges config_json fields (preserves existing unset keys),
    enforces brand_manager+ via assertCanApprove.
    Automations page: three cards (RunningPromotionCard, BigWinCard, EducationalCard), each with
    local edit state, per-card Save/Reset, dirty detection. BigWinCard includes full Value Display
    Rules section with display mode, adjustment type/value, max adjustment %, approval toggle,
    and a live preview showing source → display value transformation on sample $5,432.
    Auto-post toggle is disabled when approval_required is true (logically exclusive).
    Viewer + operator see settings read-only; brand_manager/admin can edit.
    TypeScript passes clean.
  - API surface:
    - GET   /api/automations       — list rules for active brand (seeds defaults if empty)
    - PATCH /api/automations/[id]  — update rule (brand_manager+)
  - Key notes for next session:
    - config_json is a merged object — partial PATCH only, existing keys are preserved
    - value_display lives inside big_win config_json.value_display
    - AUTOMATION_VALUE_DISPLAY_CHANGED fires only when value_display subkey changes
    - Hot games + engagement automations are out of MVP scope
    - Next step: Channels (Step 7 of build order)


- Task: Events module
  - Status: Complete
  - Notes: Three new audit actions added (event.created, event.updated, event.status_changed).
    Validation schemas in src/lib/validations/event.ts: createEventSchema, updateEventSchema,
    listEventsQuerySchema. EVENT_TYPES/EVENT_STATUSES/EVENT_TYPE_LABELS exported from there
    so all pages share the same values.
    Client helpers in src/lib/events-api.ts: list, get, create, update.
    API routes: GET+POST /api/events (brand-scoped, paginated, search+status+event_type filters);
    GET+PATCH /api/events/[id] (brand-scoped, assertCanEdit guards write operations).
    Permission: viewer = read-only; operator/brand_manager/admin can create+edit.
    Status transition tracked with separate EVENT_STATUS_CHANGED audit action when status changes.
    Frontend pages: events list (filters, pagination, no-active-brand state),
    new event form (structured form with all fields, client-side validation),
    event detail/edit page (inline edit mode, two-column layout, metadata sidebar).
    TypeScript passes clean.
  - API surface:
    - GET    /api/events         — list events (brand-scoped, filterable, paginated)
    - POST   /api/events         — create event (operator+)
    - GET    /api/events/[id]    — get single event (all roles)
    - PATCH  /api/events/[id]    — update event (operator+)
  - Key notes for next session:
    - event_type is a free string in DB — EVENT_TYPES in validations/event.ts is the canonical list
    - No linked posts generation or AI event generation — deferred to later steps
    - No winner selection logic — out of MVP scope
    - Next step: Automations (Step 6 of build order)

### 2026-04-10
- Task: Content Queue frontend + Post Detail / Preview
  - Status: Complete
  - Notes: Client-side API helpers in src/lib/posts-api.ts (list, get, update, approve, reject,
    schedule). StatusBadge with per-status colors. RejectDialog with optional reason (500 char),
    ScheduleDialog with datetime-local picker and future-only validation.
    Content Queue page (src/app/(app)/queue/page.tsx): status/platform/post_type filter selects,
    paginated post table, per-row inline approve/reject/schedule actions gated by role
    (admin/brand_manager can approve). No-active-brand and error states handled.
    Post Detail page (src/app/(app)/queue/[id]/page.tsx): full field display, inline edit mode
    for draft/rejected posts (headline, caption, CTA, banner text, image prompt), approve/reject/
    schedule action buttons, simple visual preview panel, source+tracking panel, metadata panel.
    TypeScript passes clean.
  - Key notes for next session:
    - Filter labels in queue/page.tsx use DB enum values from validations/post.ts
      (promo, big_win, event, educational / instagram, facebook, twitter, tiktok, telegram)
    - Rejection reason is stored in the `cta` field temporarily — add a dedicated DB column later
    - PLACEHOLDER_BRANDS in topbar.tsx still needs real data (brand step)
    - Next step: Events (Step 5 of build order)


- Task: Multi-brand context + Content Queue backend
  - Status: Complete
  - Notes: Cookie-based active brand resolution (active_brand_id, 30-day httpOnly cookie).
    getActiveBrand() in lib/active-brand.ts: reads cookie → validates brand active → checks
    user permission (admin bypasses permission table). All post routes enforce brand_id from
    the resolved context — frontend brand_id is never trusted.
    Post status machine in lib/post-status.ts with isValidTransition(); invalid transitions
    return 422. Permission guards via assertCanEdit / assertCanApprove in lib/api.ts.
    Audit log wired for: post.created, post.updated, post.approved, post.rejected, post.scheduled.
    Brand switcher in topbar now calls POST /api/brands/active and refreshes the router.
    Sign Out wired to signOut({ callbackUrl: "/login" }). Session user name shown in menu.
  - API surface:
    - POST   /api/brands/active         — set active brand cookie
    - DELETE /api/brands/active         — clear cookie
    - GET    /api/posts                 — list posts (brand-scoped, filterable, paginated)
    - POST   /api/posts                 — create draft
    - GET    /api/posts/[id]            — fetch single post
    - PATCH  /api/posts/[id]            — update fields (draft/rejected only)
    - POST   /api/posts/[id]/approve    — pending_approval → approved
    - POST   /api/posts/[id]/reject     — pending_approval → rejected
    - POST   /api/posts/[id]/schedule   — approved → scheduled
  - Key notes for next session:
    - PLACEHOLDER_BRANDS in topbar.tsx must be replaced with real DB data in brand step
    - Rejection reason stored in cta field for now; add dedicated column if needed later
    - lib/api.ts has shared Errors/ok/sessionUser helpers — use for all new routes
    - lib/active-brand.ts is the single entry point for brand resolution — do not bypass it
    - Next step: Content Queue frontend (Step 4 of build order)

- Task: Data Model & Auth
  - Status: Complete
  - Notes: Expanded Prisma schema to full MVP core — 11 additional tables, 4 new enums (PostType,
    Platform, SourceType added alongside existing ones). Added password_hash to User model.
    Set up NextAuth v5 (beta.30) with credentials provider; JWT sessions; session callbacks
    extend token/session with user id and role. Route handler at api/auth/[...nextauth].
    Auth proxy (Next.js 16 uses proxy.ts instead of middleware.ts) redirects unauthenticated
    users to /login. Login page at /login — plain HTML form, no shell.
    Route groups: (app)/ gets Shell layout; login/ is bare.
    Permission helpers at src/lib/permissions.ts: getUserBrandRole, canAccessBrand, canApprove,
    canEdit, canManageSettings, isAdmin. TypeScript clean. Smoke test: / → 307 /login, /login → 200.

- Task: Foundation & Setup — Next.js app shell
  - Status: Complete
  - Notes: Initialized Next.js 16 App Router with TypeScript, Tailwind v4, shadcn/ui (base-ui variant).
    Installed TanStack Query v5, TanStack Table v8, React Hook Form v7, Zod, Prisma 7 + pg adapter.
    Desktop layout: TopBar with brand switcher placeholder, Sidebar with all 11 nav items.
    Stub pages for all 10 routes. Prisma starter schema (Brand, User, UserBrandPermission + enums).
    TypeScript passes clean. Dev server responds 200 on all routes.
