# WORKLOG.md

## Ongoing Tasks

_(none)_

## Done Tasks

### 2026-04-15
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
