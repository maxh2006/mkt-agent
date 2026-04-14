# claude.md

## Purpose

This repository contains a multi-brand social media automation dashboard for online casino brands.

The product is a human-in-the-loop back office for content operations. It helps operators:
- manage multiple brands from one dashboard
- generate AI-assisted post drafts from computed source data
- review, edit, approve, schedule, and publish posts
- manage adhoc events
- configure automation rules
- track internal insights and link attribution

This is not a fully autonomous agent. Backend code computes facts. AI only turns structured inputs into content.

---

## Required Session Flow

Claude Code must follow this order every session:

1. Read `WORKLOG.md` first
2. Read `docs/00-architecture.md`
3. Read only the task-relevant docs from `docs/`
4. Update `WORKLOG.md` before starting implementation
5. Implement the task
6. Update `WORKLOG.md` after finishing implementation

Never skip `WORKLOG.md`.

---

## Work Log

- Always read `WORKLOG.md` before starting any work to understand what has been completed so far.
- `WORKLOG.md` is structured into two sections:
  - Ongoing Tasks — work currently in progress. Record current status and remaining steps in enough detail to pick up from any machine.
  - Done Tasks — completed work grouped by date. Move items from Ongoing to Done once fully finished.
- On session start: add a new entry or update the status of an existing entry in Ongoing Tasks.
- On task completion: move the entry from Ongoing to Done and record the date.

---

## Product Scope

### MVP content types
- Running promotion posts
- Big win posts
- Adhoc event posts
- Educational posts

### Later
- Hot games posts
- Engagement farming posts
- external trend research
- direct native social analytics integrations

---

## Non-Negotiable Product Rules

- Multi-brand support is part of MVP
- Every important record must include `brand_id`
- Backend code computes metrics, thresholds, rollups, and source facts
- AI only generates language and creative variations from structured input
- Human approval is required in MVP before publishing
- Keep the system simple and extensible
- Do not overengineer with microservices for MVP
- Do not make the dashboard feel like a developer admin panel

---

## Technical Specification

### Frontend
Build a desktop-first web app.

Recommended stack:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form + Zod for forms
- TanStack Table for queue-style tables
- TanStack Query for client data fetching and caching

Frontend requirements:
- Brand switcher in the top bar
- Clean operator-friendly layout
- Fast content queue workflow
- Structured forms, not prompt-only textareas
- Visual previews wherever possible
- Support manual override on important actions
- Clear status colors and filters
- Desktop-first, tablet-friendly

### Backend
Use a simple modular monolith.

Recommended stack:
- Next.js route handlers or a small Node API inside the same codebase
- TypeScript
- Prisma ORM
- PostgreSQL
- Server-side validation with Zod
- Cron/scheduled jobs for rollups
- Event logging tables for attribution and internal workflow metrics

Backend responsibilities:
- authentication and authorization
- brand-aware access control
- CRUD for posts, events, channels, templates, rules
- structured packet creation for AI generation
- storing AI outputs
- approval workflow
- scheduling and publishing orchestration
- click tracking and attribution
- internal metrics rollups

### Database
Use PostgreSQL.

Database requirements:
- `brand_id` on all major domain entities
- clear status enums
- audit logging for critical changes
- source-of-truth event tables for click, signup, deposit, revenue, post status
- rollup tables for dashboard insights
- JSON config fields only where flexibility is truly needed

### Infrastructure
Keep infra minimal for MVP.

Recommended deployment:
- app server: Vercel or a simple Node deployment
- database: managed PostgreSQL
- scheduled jobs: Vercel Cron or equivalent
- object/file storage: S3-compatible storage if assets are needed
- environment variables for API keys and secrets
- separate environments for local, staging, production

Infra rules:
- no Kubernetes
- no service mesh
- no event bus unless truly needed later
- no separate AI microservice for MVP

---

## Development Rules

- Read `WORKLOG.md` first every session
- Make the smallest reasonable change that completes the task
- Preserve MVP scope
- Prefer simple, explicit code over clever abstractions
- Avoid premature optimization
- Keep business rules readable
- Keep UI labels operator-friendly
- Use typed schemas for inputs and outputs
- Validate all server mutations
- Never let AI compute source facts
- Show source value and display value separately where display rules exist
- Every multi-brand query must be brand-aware
- Every critical update should be auditable

---

## Development Flow

Claude Code should choose the correct docs file based on the task.

### If working on architecture or setup
Read:
- `docs/00-architecture.md`
- `docs/01-development-flow.md`

### If working on database or backend models
Read:
- `docs/00-architecture.md`
- `docs/02-data-model.md`

### If working on frontend pages
Read:
- `docs/00-architecture.md`
- `docs/03-ui-pages.md`

### If working on automations or rules
Read:
- `docs/00-architecture.md`
- `docs/04-automations.md`

### If working on attribution or insights
Read:
- `docs/00-architecture.md`
- `docs/05-tracking-insights.md`

### If working on roles, permissions, approvals, or brand management
Read:
- `docs/00-architecture.md`
- `docs/06-workflows-roles.md`

### If working on AI prompt input/output boundaries
Read:
- `docs/00-architecture.md`
- `docs/07-ai-boundaries.md`

Always avoid loading unnecessary files.

---

## Build Order

1. foundation and setup
2. data model and auth
3. brand support
4. content queue and post preview
5. events
6. automations
7. channels
8. lightweight insights
9. templates/assets
10. audit logs and final polish
11. brand management (merged module — replaces brand settings)

---

## Deliverable Standard

When implementing a task:
- update `WORKLOG.md`
- keep code aligned to the relevant docs file
- do not invent out-of-scope systems
- leave clear handoff notes in `WORKLOG.md`
