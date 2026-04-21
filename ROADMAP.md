# ROADMAP.md

Structured master roadmap for the project. This supersedes the interim to-do
list previously at the top of WORKLOG.md.

Use this roadmap to guide planning and execution. Do not overengineer. Keep MVP
pragmatism.

---

## PHASE 1 — STABILIZE CURRENT OPERATOR PLATFORM

Goal:
Finish aligning the existing backoffice so it is operationally consistent
before deeper integrations.

Includes:
1. Audit Templates & Assets
2. Audit Insights
3. Audit Channels
4. Audit Brand Management
5. Audit Users & Roles
6. Audit Audit Logs
7. Re-check Queue / Calendar / status semantics
8. Re-check source-constrained refine behavior
9. Re-check grouped draft/sample visibility
10. Re-check All Brands readability across pages

Definition of done:
- no major workflow confusion across main backoffice pages
- operator-facing wording is clean
- statuses are consistent
- review / refine / approve / schedule / delivery visibility all make sense

---

## PHASE 2 — COMPLETE MANUS PUBLISHING LIFECYCLE

Goal:
Turn the platform from review-only into full review + publish operations.

Includes:
1. ~~Build Manus callback / webhook route~~ — **Done 2026-04-21.** `POST /api/manus/callback`, HMAC-signed.
2. ~~Create PostPlatformDelivery rows at approval / scheduling time~~ — **Done 2026-04-21.** `ensureDeliveriesForPost()`.
3. ~~Wire post-level status reconciliation using computePostStatusFromDeliveries()~~ — **Done 2026-04-21.** `reconcilePostStatus()`.
4. ~~Add View Delivery button on post detail page~~ — **Done.** Row-level + modal are live in Content Queue.
5. ~~Wire actual retry redispatch~~ — **Done 2026-04-21.** Dispatcher + Cloud Scheduler pick up requeued rows automatically; audit-logged.
6. ~~Set up Cloud Scheduler for /api/jobs/dispatch~~ — **Done 2026-04-21.** Job `mkt-agent-dispatch` in `asia-east2`, firing every 2 min.
7. ~~Finalize Manus credentials and response protocol~~ — **Done 2026-04-21.** Dispatch response shape, callback payload, correlation keys, error taxonomy, idempotency — see docs/00-architecture.md "Manus protocol — finalized contract".
8. ~~Add signed callback verification~~ — **Done 2026-04-21.** HMAC-SHA256 over raw body with `MANUS_WEBHOOK_SECRET`.
9. ~~Decide whether refine-after-approval is allowed~~ — **Decided 2026-04-21: NO in MVP.** Enforced in UI (Queue row gating + EditPostModal defensive lockout) and server (PATCH `/api/posts/[id]` only accepts draft/rejected). See docs/06-workflows-roles.md.
10. ~~Add approved payload snapshot if refine-after-approval is allowed~~ — **Deferred** under the locked "no refine-after-approval" policy; dispatcher safely reads live Post fields at dispatch and retry.

**Phase 2 status: all items resolved.** Remaining "go-live" work (wiring
`MANUS_AGENT_ENDPOINT` to a real Manus instance, rotating secrets,
upgrading the Cloud Scheduler target from raw HTTP to HTTPS behind a
domain) is operational, not product scope — tracked in docs/08-deployment.md.

Target lifecycle:
- Draft
- Pending Approval
- Scheduled
- Publishing
- Posted
- Partial
- Failed
- Rejected

Definition of done:
- approved content can be published by Manus
- delivery is visible per platform
- failed platforms can be retried safely
- post-level status reflects actual platform outcomes

---

## PHASE 3 — FINALIZE DATA SOURCE LAYER

Goal:
Complete the source integration architecture cleanly.

Source split:
- Big Wins → BigQuery
- Hot Games → BigQuery
- Running Promotions → API

Includes:
1. Confirm BigQuery access/auth is stable
2. Finalize Big Wins BQ field mapping
3. Finalize Hot Games BQ field mapping
4. Confirm username/display handle availability in shared.users
5. Finalize dedupe keys for Big Wins
6. Keep schema adapter / mapping layer isolated
7. Keep Running Promotions on separate operational API
8. Avoid leaking raw schema assumptions into UI/rule configs

Definition of done:
- backend knows how to fetch candidate facts cleanly from each source
- rule engine stays source-agnostic
- schema volatility is contained in mapping/adapters only

---

## PHASE 4 — BUILD THE AI CONTENT GENERATOR AGENT

Goal:
Build the real content-generation engine that turns source/context into
queue-ready drafts.

Includes:
1. Prompt/context builder
   - Big Wins
   - Running Promotions
   - Hot Games
   - Adhoc Events
   - Educational

2. Draft generation flow
   - multiple samples
   - source-aware grouping
   - insert into Content Queue

3. Source-constrained refine flow
   - visual/tone/presentation edits only
   - fixed campaign/source rules stay locked

4. Image generation flow
   - decide text-on-image vs caption logic
   - support reward/mechanics emphasis when appropriate

5. Brand-aware generation
   - brand voice
   - CTA style
   - language style
   - design notes
   - sample captions

6. Operator sample comparison / selection support
7. Preserve edit/reject/approval metadata for future learning

Definition of done:
- source facts can produce AI draft samples into Content Queue
- drafts are brand-aware and source-aware
- refine flow respects locked business rules
- operators can compare and choose between samples

---

## PHASE 5 — AUTOMATE CONTENT CREATION FLOWS

Goal:
Use source rules + AI generation to create drafts automatically at the right
times.

Includes:
1. Big Wins automation generation flow
2. Running Promotions automation generation flow
3. Hot Games automation generation flow
4. Adhoc Event generation flow
5. Educational cadence generation flow
6. Group/sample generation handling
7. Generation health and observability

Definition of done:
- automations create drafts reliably into Content Queue
- no direct publishing from generation layer
- operators can review all generated outputs before publish

---

## PHASE 6 — CLOSE THE LEARNING LOOP

Goal:
Turn operator choices + content performance into future generation
improvements.

Learning signals to preserve:
- approved drafts
- edited drafts
- rejected drafts
- selected sample from a group
- top posts by clicks
- top posts by deposits
- top posts by GGR

Includes:
1. Preserve structured learning events
2. Define performance-learning feedback model
3. Surface useful insights for content optimization
4. Feed learnings back into prompt/context builder later

Definition of done:
- the system can eventually learn what operators prefer
- the system can eventually learn what actually performs

---

## PHASE 7 — SECONDARY PRODUCT HARDENING

Goal:
Finish supporting modules after the core content/publish engine is stable.

Includes:
1. Users & Roles polish
2. Audit Logs polish
3. Channels polish
4. Templates & Assets improvements
5. Insights expansion
6. Edge-case operational safeguards
7. Better error handling / recovery tooling

Definition of done:
- all admin/support modules are strong enough for team use at scale

---

## EXECUTION PRIORITY

Current practical priority order:
1. Finish Manus publishing lifecycle
2. Finalize BigQuery/API source layer
3. Build AI content generator agent
4. Automate draft creation flows
5. Close learning loop
6. Continue secondary audits/polish

---

## CORE PRODUCT RULES

Always preserve these rules:
- AI creates drafts only
- Content Queue handles human review
- Manus handles publishing
- Retry reuses the same approved payload
- Refine does not break source rules
- Big Wins + Hot Games use BigQuery
- Running Promotions uses separate API
- Docs + WORKLOG must stay aligned with architecture changes
