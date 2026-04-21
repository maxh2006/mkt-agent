# 00-architecture.md

## System Overview

Build a multi-brand social media automation dashboard.

The system has four core layers:
1. operator dashboard
2. backend business logic
3. database and event storage
4. AI content generation layer

The dashboard is the control center.
The backend computes all facts.
The database stores source truth and rollups.
The AI layer only generates copy and creative output from structured packets.

---

## Core Modules

### 1. Brand Context
Every major entity belongs to a brand.
Use `brand_id` everywhere it matters.

### 2. Content Operations
Handles:
- posts
- content queue
- preview/edit/approve/schedule
- post status lifecycle

### 3. Events / Campaign Briefs
Handles adhoc campaigns like Top Fans and seasonal activities.
Events are structured AI-ready campaign briefs with target audience, tone, CTA, platform scope, and AI notes.
Supports posting schedule configuration with daily/weekly/monthly recurrence.
Events can generate draft posts in the content queue for human review.
Event statuses: active → ended → archived (lifecycle-managed).

### 4. Automations
Handles rule configuration for promo posts, big wins, educational posts, and later hot games.

### 5. Channels
Stores per-brand social platform connections and publishing targets.

### 6. Tracking and Insights
Stores click, signup, deposit, and revenue attribution from tracked links.
Provides lightweight internal insights.

### 7. AI Generation
Consumes structured packets and returns captions, banner text, and variants.

---

## High-Level Architecture

### Frontend
Next.js app for operator dashboard.

### Backend
Modular monolith in TypeScript.
Use route handlers or server actions where appropriate.
Keep logic grouped by domain:
- brands
- posts
- events
- automations
- channels
- insights
- auth

### Database
PostgreSQL with Prisma.

### Publishing — Manus worker
Manus is the external auto-publishing worker. Responsibilities split:

Backoffice (this app):
- source of truth for drafts
- review / refine / reject / approve / schedule
- queue + calendar visibility
- delivery visibility (per-platform status surfaced via delivery modal)
- source/rule context shown to operator

Manus:
- receives publish jobs from approved/scheduled posts
- posts to external platforms (Meta, Telegram, more later)
- returns success/failure per platform
- retries when requested
- reports platform-level outcomes back

Retries happen at the **platform delivery level** and resend the same approved
content payload — retry does NOT regenerate content, re-run automation source logic,
or require re-approval.

Visible post lifecycle (operational):
Draft → Pending Approval → Scheduled → Publishing → Posted / Partial / Failed.
Rejected is a terminal path from Pending Approval.
Approved is metadata only (`approved_at`, `approved_by`) — not a long-lived
operational status.

### Dispatcher
`src/lib/manus/dispatcher.ts` is the worker-side entry point that hands queued
deliveries to Manus. Triggered by POST `/api/jobs/dispatch` (secret-gated via
`MANUS_DISPATCH_SECRET` header). A single call:

1. Runs one atomic SQL statement that selects queued deliveries with
   `scheduled_for <= now()`, locks them with `FOR UPDATE SKIP LOCKED`, marks them
   `publishing`, sets `publish_requested_at`, and returns the claimed rows.
   Safe against concurrent dispatchers.
2. Loads the parent posts in a single batch query (no N+1).
3. Builds a flat `ManusDispatchPayload` per claimed delivery from the approved
   post fields (no regeneration, no re-approval, no source re-run).
4. Hands each payload to `dispatchToManus()` at `src/lib/manus/client.ts`.

The Manus client is a thin, replaceable boundary. If `MANUS_AGENT_ENDPOINT` is
unset it runs in **dry-run mode** (logs payload, returns accepted). Otherwise it
POSTs the payload with optional `MANUS_API_KEY` as a bearer token.

Per-platform delivery results come back asynchronously via a future Manus
callback route (not in this task). `post_id` and `delivery_id` are the stable
correlation keys Manus must echo back.

Retry reuses the same picker: resetting a delivery to `queued` makes it eligible
for the next dispatcher pass. No regeneration, no re-approval.

### External Data Source — Shared BigQuery
Primary operational facts come from a shared BigQuery dataset maintained by the platform team.
Tables: `shared.users`, `shared.transactions`, `shared.game_rounds`, `shared.games`.
Sync: hourly at :00 GMT+8. PII removed. Read-only for us.
Query execution billed to our own GCP project (`mktagent-493404`) — never the platform project.
Schema is still evolving; see docs/04-automations.md for field mapping and volatility strategy.

### Jobs
Scheduled jobs for rollups and lightweight background tasks.

---

## Design Principles

- Build simple and clear first
- Keep modules easy to understand
- Avoid hidden magic
- Prefer explicit workflows
- Human approval before publish in MVP
- Brand isolation with shared infrastructure
