# 07-ai-boundaries.md

## AI Role

AI is used only for content generation from structured inputs.

AI can:
- generate captions
- generate banner text
- generate variations
- rewrite tone
- generate adhoc event concepts

AI cannot:
- compute metrics
- inspect raw analytics logs to derive facts
- calculate thresholds
- qualify big wins
- calculate promo payouts
- calculate attribution
- compute dashboard metrics

---

## Input Contract

AI should receive small structured packets.
Do not send full raw logs.

Example concept:
- brand context
- post type
- platform
- source facts already computed by backend
- tone preferences
- CTA style

---

## Output Contract

AI outputs:
- headline
- caption
- CTA
- banner text
- optional image prompt
- optional variations

The system stores the output and lets humans review it.

---

## Sample Brief Panel (Create Event page)

The Create Event page shows a right-side Sample Event Brief panel for operator
guidance. Samples come from a hardcoded list of 6 coherent example briefs — not
from AI, not from BigQuery, not from the event record being created. The panel
is reference-only; it does not fill the form, does not copy values into any
event record, and is not sent as AI input at event creation time.
Required form fields remain manual and mandatory.

---

## Shared BigQuery Data Source

Automation scans (Big Wins, Hot Games) read from the shared BigQuery dataset
maintained by the platform team. AI consumes pre-computed facts — not raw queries.

- AI receives a structured packet assembled by the backend from BQ rows.
- AI never executes SQL, never sees raw rows, never fetches data itself.
- Column references are centralized in a single adapter. Schema changes are
  absorbed there, not in the AI input layer.

### Username in Big Wins content
Username is a display handle chosen by the user (not PII under the guide's
definition). Big Wins default-rule drafts use the source `username` from
`shared.users`, scoped by `brand_id`, then apply `maskUsername()` before display.
Custom-rule drafts continue to use generated random usernames.
Effective identity for deduplication is `(username, brand_id)` since the same
username can exist across brands.

---

## Hot Games Frozen Snapshot

Hot Games drafts store a frozen ranked-games snapshot in Post.generation_context_json at
scan time. When a Hot Games draft is refined from Content Queue, the AI reuses that
snapshot — it must NOT trigger a new API scan and must NOT replace the games list.
The snapshot includes scan timestamp, source window, ranked games, and time mapping.
This preserves the original ranked batch across refinement cycles.

---

## Event Campaign Brief Context

When refining event-derived posts, the AI receives a structured brief from the source event:
- theme, objective, rules, reward
- target_audience, cta, tone
- platform_scope, notes_for_ai
- posting instance summary and occurrence datetime

The AI uses this context for content generation and refinement.
Event-derived drafts remain constrained by the original event rules during refinement.
Editing a queue draft must NOT change event recurrence or campaign rules.
The actual AI generation is not yet implemented — only the data architecture and context resolution.

---

## Guardrails

- backend is source truth
- AI is never source truth
- do not let prompt design replace business logic
- keep token use low by loading only task-relevant docs
