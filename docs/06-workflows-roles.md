










# 06-workflows-roles.md

## Core Workflows

### Promo Post Flow
1. backend detects schedule
2. structured packet is created
3. AI generates draft
4. draft enters queue
5. operator reviews and approves
6. post is scheduled or published

### Big Win Flow
1. backend qualifies event
2. structured packet is created
3. AI generates draft
4. operator reviews
5. operator approves and publishes

### Adhoc Event Flow
1. operator creates event with campaign brief (target audience, CTA, tone, platform scope, AI notes). Create page shows a reference-only Sample Event Brief panel with 8 rows and a Generate Sample Prompt button — does not fill the form; required fields stay manual. Posting Schedule supports "Generate Now" (immediate draft generation into Content Queue, no recurrence) or Daily / Weekly / Monthly for recurrence-based occurrences.
2. operator configures posting schedule (daily/weekly/monthly with time)
3. event is created as active
4. operator clicks "Generate Drafts" to create shell posts per occurrence × platform
5. (future) AI generates content for drafts using event brief context
6. drafts enter Content Queue for human review
7. operator edits, approves, and schedules
8. event auto-transitions to ended when past end_at, then archived after 14 days
9. editing event-derived drafts in queue retains original event rules and schedule context

### Educational Flow
1. topic is selected or scheduled
2. AI generates draft
3. operator reviews
4. operator schedules or publishes

---

## Roles

### Admin
- all brand access
- can create and manage brands (Brand Management module)
- can manage users, channels, automations, templates, and rules across all brands

### Brand Manager
- brand-scoped access
- can approve, schedule, edit posts
- can manage channels, automations, and templates for their brand
- cannot create new brands or edit brand identity/integration settings

### Operator
- brand-scoped access
- can create drafts, events, review content, edit copy

### Viewer
- read-only access

---

## AI Context Precedence

AI content generation reads layered context in this order (later overrides earlier on conflict):

1. **Brand Management (default / base layer)** — positioning, voice, language style + sample, audience persona, notes for AI, banned phrases + topics, hashtags, colors, logos, sample captions. This is the admin-maintained base AI profile for each brand.
2. **Adhoc Event brief** — theme, objective, rules, reward, target audience, CTA, tone, platform scope, notes for AI. When an event-derived post is being generated/refined, event fields override brand fields wherever both specify the same attribute.

Alongside these two rule layers, **Templates & Assets is a reusable
supporting library** the AI generator may draw from:

- **Copy templates** — reusable caption structures / post shapes
- **CTA snippets** — reusable call-to-action lines
- **Banner text patterns** — reusable short overlay-text patterns
- **Prompt templates** — reusable image-generation scaffolds
- **Reference assets** — reusable visual reference URLs (distinct from
  Brand Management's `benchmark_assets`, which are brand-identity base
  guidance rather than operational library material)

Templates & Assets is **not** a rule layer — it cannot override the
brand or event layers. It is material the generator can reach for when
the rule layers ask for a concrete building block.

The precedence is documented here and in `docs/07-ai-boundaries.md`. It does not need to be surfaced loudly in the UI beyond a small "base AI profile; events override" note at the top of the Brand Management edit dialog and a "not base AI rules — see Brand Management" callout on the Templates & Assets page.

---

## Approval Rules

- human approval required in MVP before publish
- keep approval actions fast
- audit all critical changes
- always show source data in preview when relevant

---

## Content Queue Status Lifecycle (Manus publishing)

Operator-side (review):
- **draft** — generated, not yet reviewed
- **pending_approval** — submitted for review
- **rejected** — rejected by operator; retained for history/learning (not deleted)

Approved is NOT a visible status — approval is metadata only.

Delivery-side (driven by Manus):
- **scheduled** — approved, waiting for publish time (or immediate dispatch window)
- **publishing** — Manus is currently attempting per-platform delivery
- **posted** — all required platform deliveries succeeded
- **partial** — some platforms succeeded, some failed
- **failed** — all targeted deliveries failed

Approval as metadata (not a visible state):
- `approved_at` and `approved_by` are recorded on the post
- `approved` remains in the enum for legacy/historical rows only
- The Approve action transitions `pending_approval` → `scheduled` directly
- If `scheduled_at` was not pre-set, approval defaults it to `now()` (immediate)
- Rejection metadata (rejected_at, rejected_by, rejected_reason) likewise persisted

Approval flow:
1. operator approves
2. backoffice records approved_at / approved_by and sets status = scheduled
3. scheduled_at defaults to now() if operator didn't pre-schedule
4. backoffice creates a PostPlatformDelivery row for (post_id, post.platform)
   via `ensureDeliveriesForPost()`. Row status is `queued` if scheduled_for
   has arrived, `scheduled` otherwise. The same helper runs on explicit
   `POST /api/posts/[id]/schedule`. Idempotent via the unique constraint +
   `createMany({ skipDuplicates: true })`.
5. Manus dispatcher (POST /api/jobs/dispatch, cron-driven) picks due
   PostPlatformDelivery rows (status IN ('queued','scheduled') with
   scheduled_for<=now), atomically claims them (FOR UPDATE SKIP LOCKED),
   marks them publishing, and hands a payload to the Manus worker.
   No content regeneration or re-approval.
6. per-platform results come back via `POST /api/manus/callback` (HMAC-signed
   with `MANUS_WEBHOOK_SECRET`), transitioning the individual PostPlatformDelivery
   to posted or failed. Callback is idempotent: repeated success callbacks
   fill in missing `external_post_id` only; repeated failure callbacks refresh
   `last_error` only when it differs; posted→failed regressions are refused
   (200 with `refused=true`). Failed callbacks may include a machine-readable
   `error_code` (see `ManusErrorCode` in docs/00-architecture.md); when
   provided, `last_error` is stored as `"[CODE] human message"`.
7. the same callback then runs `reconcilePostStatus()`, which computes the
   aggregate via `computePostStatusFromDeliveries()` and updates
   `Post.status` (+ `Post.posted_at` on first-time posted): posted | partial | failed

Retries:
- Happen at the platform delivery level (see PostPlatformDelivery model)
- Resend the same approved content payload
- Do NOT regenerate content, re-run automation source logic, or require re-approval
- Available from the Delivery Status modal per failed platform
- API: `POST /api/posts/[id]/deliveries/[platform]/retry`. Allowed only when
  delivery status is `failed`. Resets status to `queued`, sets
  `scheduled_for = now()`, bumps `retry_count`, clears `last_error`, writes
  `delivery.retried` to audit_logs. Cloud Scheduler's next dispatcher tick
  claims and re-dispatches the row — no operator action needed after the
  retry click. Role-gated to brand_manager+.

Refinement:
- Content Queue refinements are constrained to visual/tone/presentation only
- Source rules, reward, campaign period, posting schedule, and snapshot remain
  fixed across refinement cycles — regardless of the Manus publishing path.

Refinement scope — MVP policy (locked 2026-04-21):
- **NO REFINE AFTER APPROVAL.** Once a post is approved and enters the
  delivery lifecycle, its content is locked.
- Refine is available ONLY in review-side statuses: `draft`,
  `pending_approval`, `rejected`.
- Refine is FORBIDDEN in delivery-side statuses: `scheduled`, `publishing`,
  `posted`, `partial`, `failed`. (Approved is metadata-only and not editable.)
- There is **no Return to Review** flow in MVP — approved posts cannot be
  sent back to review. If a mistake is caught after approval, the operator's
  recourse is to let the delivery complete and create a new post.
- Because content is locked post-approval, the Manus dispatcher safely reads
  live Post fields at dispatch time and on retry; **approved-payload
  snapshotting is deferred** (not needed under this policy).
- Enforced in three places: row-level Refine button gating, modal-level
  defensive lockout render, and server-side PATCH `/api/posts/[id]` (which
  only accepts `draft` / `rejected` updates).
