# 04-automations.md

## Automation Rules

Rules-only configuration page with 3 tabs.
Does not generate, preview, or publish content.
Matched rules create drafts in Content Queue for operator review.

---

## Data Source

Big Wins and Hot Games read from the shared BigQuery dataset provided by the platform team.
On Going Promotions uses a separate API URL (not from BigQuery).

**BigQuery dataset**
- Tables: `shared.users`, `shared.transactions`, `shared.game_rounds`, `shared.games`
- Sync: hourly at :00 GMT+8. ~1 hour delay from real time.
- Read-only. PII removed (email, phone, real name, IP, KYC) — username is a display handle, not classified as PII.
- Query execution billed to our GCP project (`mktagent-493404`). Platform team's project owns storage; we own query costs.

**Env vars** (see `.env.production.example`):
- `BQ_PLATFORM_PROJECT_ID` — platform team's GCP project ID
- `BQ_DATASET` — always `"shared"`
- `BQ_SERVICE_ACCOUNT_EMAIL` — our service account, granted `roles/bigquery.dataViewer` by platform team

**Cost/constraint rules**
- Never `SELECT *`. List columns explicitly.
- Always use partition-friendly filters: `WHERE bet_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL N MINUTE)`.
- Queries must run in our own project (use `projectId: "mktagent-493404"` in SDK).
- Never use `information_schema.columns` for dynamic column discovery.
- Set a GCP monthly budget alert ($100 recommended).

**Schema volatility**
Platform is still being built. Columns may be renamed or added.
- Schema changes are announced in the platform team's Telegram channel with 1-week advance notice.
- All column references should be centralized (later: `src/lib/bq/shared-schema.ts`) so drift can be absorbed in one place.
- A daily health-check query should verify expected columns exist.

---

### Big Wins field mapping
- payout threshold → `shared.game_rounds.payout_amount`
- multiplier threshold → `shared.game_rounds.win_multiplier` (pre-computed integer)
- status filter → `status = 'settled'`
- game icon → `shared.games.game_icon` (public URL)
- username → `shared.users.username` scoped by `brand_id` (pending platform team confirmation; see follow-ups). Masked via `maskUsername()` before display.
- dedupe key: current config options (`win_id`, `transaction_id`) do not map directly to `shared.game_rounds` columns — flagged as a follow-up, likely derived from `user_id + bet_at + payout_amount`.

**Live adapter** (2026-04-23): `src/lib/big-wins/` — `fetchBigWinsForBrand(input)` produces both `rows[]` (for custom-rule range checks) and `facts[]` (AI-ready `BigWinFacts` with `maskUsername()` applied). Missing-table tolerant while `shared.game_rounds` is still being provisioned. See `docs/00-architecture.md` → "Big Wins live adapter" for module map.

### Hot Games field mapping
- per-game RTP aggregated from `shared.game_rounds` over `source_window_minutes`
- joined to `shared.games` for name, icon, vendor
- partition-friendly filter on `bet_at`

**Live adapter** (2026-04-23): `src/lib/hot-games/` — `fetchHotGamesForBrand(input)` produces a single frozen `HotGamesFacts` snapshot per call. Ranking is static `g.rtp DESC` with `round_count` tie-break (observed-payout ranking is a documented follow-up). Input validation enforces strictly-ascending `time_mapping[]` before any BQ call. See `docs/00-architecture.md` → "Hot Games live adapter" for module map.

### Multi-brand identity
The same username (e.g. `maxtest`) can exist across brands. The effective identity is `(username, brand_id)`. All joins and dedupes must be brand-scoped.

---

## Tab 1: Big Wins

Batch snapshot mode — system checks source data periodically.

### Config Shape
```json
{
  "check_frequency": { "interval_hours": 6 },
  "draft_cadence": { "scan_delay_hours": 2, "sample_count": 3 },
  "default_rule": { "min_payout": 500, "min_multiplier": 10, "logic": "OR" },
  "custom_rule_enabled": false,
  "custom_rule": {
    "payout": { "min": 1000, "max": 5000, "increase_pct": 0 },
    "multiplier": { "min": 50, "max": 500, "increase_pct": 0 }
  },
  "dedupe_key": "win_id",
  "content_output_rules": {
    "include_game_icon": true, "include_bet_amount": true,
    "include_win_amount": true, "include_datetime": true,
    "multiplier_display_rule": "only_if_meets_threshold"
  }
}
```

### Rules
- Check frequency: hourly interval. Anchor starts at 00:00:00 of the rule creation day
  and repeats at the selected interval from that anchor.
- Draft creation timing: single delay (scan_delay_hours) applied once after each scan
  completes — not recurring draft creation.
- Default rule: supports AND or OR logic between payout and multiplier thresholds
  (default OR). AND requires both conditions met. OR requires either condition met.
- Custom rule: range-based with display increase %. Source values never modified.
- Content output: game icon, bet amount, win amount, datetime, conditional multiplier
- Username masking: first 2 + * middle + last 2 chars (reusable helper maskUsername)
- Username source:
  - Default rule drafts: use original source username (then masked)
  - Custom rule drafts: generate a fresh random username per draft (6–8 lowercase
    alphanumeric chars a-z and 0-9, then masked). Source username is not used.
- Deduplication by win ID, transaction ID, or timestamp+user+amount

---

## Running Promotions automation flow (Phase 5 — shipped 2026-04-27)

Server-side orchestration that turns the existing live promo adapter into auto-generated Content Queue drafts. Module: `src/lib/automations/running-promotions/`. Entry point: `runRunningPromotionsAutomation({brand_id_filter?})`.

**Eligibility query**: `Brand.findMany({where: {active: true, automation_rules: {some: {rule_type: "running_promotion", enabled: true}}}})`. Optional `brand_id_filter` arg narrows to a single brand for verification.

**Per-brand flow** (sequential per brand, sequential per promo):
1. `loadBrandContext(brand.id)` — needed by the normalizer.
2. `fetchPromotionsForBrand(brand.id)` — adapter never throws on expected conditions; errors come back via `result.error.code`.
3. For each `PromoFacts × platform`:
   - Dedup check: `db.post.findFirst({where: {brand_id, source_type: "promo", source_id: facts.promo_id, platform}, select: {id: true}})`. Hit → skip; miss → generate.
   - `normalizers.normalizePromo({brand, facts, platform})` → `NormalizedGenerationInput`.
   - `runGeneration({input, created_by: <first admin>})` — full pipeline (text → image → composite → GCS upload → queue insert).

**Default platform = `["facebook"]`** when the rule config doesn't specify platforms. **MVP-ONLY** — not a permanent product rule. Mirrors the Events generate-drafts fallback. Future enhancement: read from `Brand.channels` active rows or add a `platforms[]` array to the running_promotion config_json.

**Dedup rule** (locked):
- Exact match on `(brand_id, source_type='promo', source_id=promo_id, platform)`.
- **Status-agnostic**: even if a previous draft is in `rejected` or `failed`, reruns still skip generating a new one. Operators handle re-generation manually for MVP — delete the prior row to force a new draft from updated upstream data. Status-aware dedup is a documented future enhancement.
- When upstream mutates a promo's mechanics under the same `promo_id`, we still skip (operator can manually refine the existing draft).

**`created_by` for automation drafts**: first admin user found, ordered by `created_at ASC` (deterministic). Helper: `src/lib/automations/get-creator.ts#getAutomationCreator()`. **TEMPORARY MVP shortcut** — replaceable by a real "system" / "service" user via a one-time data migration; the helper's internals will swap with no caller-side change.

**Failure isolation** (locked behavior):

| Scenario | Result |
|---|---|
| No eligible brands | Empty `brands[]`; not an error. |
| `getAutomationCreator()` finds no admin | Throws — orchestrator can't run; surfaces via API 500 / CLI exit 1. |
| Brand A's adapter returns `error` | `brands[A].fetch_error_code` populated; brand A skipped; B/C/… continue. |
| Brand A's promo P1 generation throws | `brands[A].errors[]` records `{phase: "generate", promo_id, message}`; P2/P3 continue. |
| Promo P1 already in queue | `brands[A].skipped_dedupe_count` incremented; no generation call. |

Text drafts always ship even when image generation / GCS storage fail — that discipline is in `runGeneration()` itself; this orchestrator doesn't re-implement it.

**Verification surfaces**:
- **Admin-only API route**: `POST /api/automations/running-promotions/run` with optional body `{brand_id?: string}`. Returns the `PromoAutomationRunResult` JSON. Suitable for ops dashboards and the future Cloud Scheduler trigger.
- **CLI wrapper**: `npm run automation:running-promotions [-- <brand_id>]`. Pretty-prints the result. Suitable for one-shot ops verification + ad-hoc re-runs.

**Observability** — one-line-per-brand log:
```
[automation:promo] brand=<id> fetched=<N> skipped_dedupe=<N> generated=<N> errors=<N> [fetch_error=<code>]
```
Plus a start + done line for the run. No promo content in logs.

**Out of scope for the orchestrator** (deferred):
- Cadence honoring (`config.check_schedule.weekdays/time` is only read by future scheduler infra).
- Per-promo recurrence (`config.promo_rules[].posting_mode = daily/weekly/monthly`).
- Cloud Scheduler job for periodic invocation (separate infra step; same shape as `mkt-agent-dispatch` for Manus).
- Auto-approval / delivery rows / Manus dispatch — drafts only.
- Platform expansion beyond `["facebook"]`.
- New `AuditAction` enum value — orchestrator logs to console; audit-action expansion is a separate cleanup task.
- Real "system" user via migration — find-first-admin shortcut today.

---

## Adhoc Event automation flow (Phase 5 — shipped 2026-04-28)

Server-side orchestration that scans eligible Adhoc Events on a cadence and routes their occurrences through the same `runGeneration()` pipeline as the manual "Generate Drafts" button. Module: `src/lib/automations/adhoc-events/`. Entry point: `runAdhocEventsAutomation({brand_id_filter?, event_id_filter?, lookahead_hours?, now?})`.

This is the Event equivalent of the Running Promotions automation flow. Both share `getAutomationCreator()` and the same admin-only verification-surfaces shape, but the Event orchestrator is **event-first** (top-level loop is over events, not brands) because each brand owns many events.

**Eligibility query**:
```ts
db.event.findMany({
  where: {
    status: "active",
    auto_generate_posts: true,
    brand: { active: true },
    ...(args.brand_id_filter ? { brand_id: args.brand_id_filter } : {}),
    ...(args.event_id_filter  ? { id: args.event_id_filter }      : {}),
  },
  include: { brand: { select: { id: true, name: true, active: true } } },
  orderBy: { start_at: "asc" },
});
```

**Operator opt-in via `Event.auto_generate_posts`** (existing schema field, default `false`). Operators flip it to `true` per event when they want unattended generation. The manual `POST /api/events/[id]/generate-drafts` route continues to ignore the flag — it's an explicit operator action and stays available regardless.

**Lookahead window — `LOOKAHEAD_HOURS = 24` (default)**. Constant at the top of the orchestrator; override via `args.lookahead_hours` for testing. Reason: prevents "30-day daily event" floods where a single run would create 30 drafts. Operators see drafts appear ~24h before each scheduled occurrence — enough lead time for review/approve. Tighten the cycle via the future Cloud Scheduler interval (e.g. hourly tick + 24h window = each occurrence has ~24 chances to be picked up; the dedupe cuts duplicates).

**Per-event flow** (sequential per event, sequential per slot):
1. Compute occurrences:
   - **Recurrence mode** (posting_instance_json parses to a config): require both `start_at` + `end_at`. Call `generateOccurrences(piConfig, start_at, end_at)` (already filters to `>= now`), then additionally filter to `<= now + lookahead_hours`.
   - **Generate Now mode** (null piConfig): synthesize one occurrence at `now`. Always inside the window by construction.
2. If zero occurrences land in the window → mark `ineligible_reason: "no_occurrences_in_window"`, no slots processed.
3. `loadBrandContext(brand.id)` — failure here records `{phase: "context_load"}` and skips the event.
4. Resolve platforms from `event.platform_scope` (string array) or fall back to `["facebook"]` — mirrors the manual route's MVP fallback.
5. For each `(occurrence × platform)` slot:
   - Dedup check: `db.post.findFirst({where: {brand_id, source_type: "event", source_id: event.id, source_instance_key: occurrence.toISOString(), platform}, select: {id: true}})`. Hit → skip + increment `skipped_dedupe_count`; miss → generate.
   - Build `EventOverride` (mirrors manual route lines 112-129).
   - Coerce visual settings via `coerceEventVisualOverride(event.visual_settings_json)`.
   - `normalizers.normalizeEvent({brand, event: eventOverride, platform, sample_count: 1})`.
   - `runGeneration({input, created_by: <first admin>})` — full pipeline (text → image → composite → GCS upload → queue insert).
6. When `generated_drafts_count > 0`, write a single per-event audit log entry using `AuditAction.EVENT_DRAFTS_GENERATED` with `automation: true` and `lookahead_hours_at_run` in the after-state. Reuses the existing audit action — no schema change.

**Dedup rule** (locked, mirrors manual route + Running Promotions discipline):
- Exact match on `(brand_id, source_type='event', source_id=event.id, source_instance_key=occurrence ISO, platform)`.
- **Status-agnostic**: even if a previous draft is `rejected` or `failed`, reruns still skip generating a new one. Operators handle re-generation manually for MVP — delete the prior Post row to force a new draft. Status-aware dedup is a documented future enhancement.
- The dedup mirrors the manual route's identity logic exactly so manual + automated runs cannot race-condition into duplicates.

**`samples_per_slot = 1` (locked, MVP)**. Manual route accepts `?samples_per_slot=N` (1–5); automation does not expose that knob today. Operators run the manual route when they want sibling-sample comparison.

**`created_by` for automation drafts**: first admin user found, ordered by `created_at ASC`. Helper: `src/lib/automations/get-creator.ts#getAutomationCreator()` — same TEMPORARY MVP shortcut Running Promotions uses; future system-user migration swaps internals with no caller-side change.

**Failure isolation** (locked behavior):

| Scenario | Result |
|---|---|
| No eligible events | `events_scanned: 0`, empty `events[]`; not an error. |
| `getAutomationCreator()` finds no admin | Throws — orchestrator can't run; surfaces via API 500 / CLI exit 1. |
| Event has posting_instance_json but missing start_at/end_at | `ineligible_reason: "missing_dates"`, no slots processed; other events continue. |
| Event has zero occurrences in `[now, now+24h]` | `ineligible_reason: "no_occurrences_in_window"`, no slots processed; other events continue. |
| `loadBrandContext()` fails for an event's brand | `errors[]` records `{phase: "context_load", message}`; that event skipped; others continue. |
| One slot's `runGeneration` throws | `errors[]` records `{phase: "generate", occurrence_iso, platform, message}`; other slots within the event continue; other events continue. |
| Slot already exists (dedupe hit) | `skipped_dedupe_count` incremented; no generation call. |

Text drafts always ship even when image generation / GCS storage fail — that discipline is in `runGeneration()` itself; this orchestrator doesn't re-implement it.

**Verification surfaces**:
- **Admin-only API route**: `POST /api/automations/adhoc-events/run` with optional body `{brand_id?: string, event_id?: string, lookahead_hours?: number}`. Returns the `EventAutomationRunResult` JSON. Suitable for ops dashboards and the future Cloud Scheduler trigger.
- **CLI wrapper**: `npm run automation:adhoc-events [-- <brand_id> | --event=<event_id> | --lookahead=<hours>]`. Pretty-prints the result. Suitable for one-shot ops verification and ad-hoc re-runs when an operator just flipped a flag and wants the drafts to appear immediately.

**Observability** — three log line shapes:
```
[automation:event] start lookahead_hours=<N> events=<N> creator=<id> [filter=<...>]
[automation:event] event=<id> brand=<id> occurrences=<N> slots=<N> skipped_dedupe=<N> generated=<N> errors=<N> [reason=<ineligible_reason>]
[automation:event] done events_scanned=<N> events_eligible=<N> slots_processed=<N> skipped_dedupe=<N> generated=<N> errors=<N> duration_ms=<N>
```
No event content in logs (titles only, max 80 chars).

**Out of scope for the orchestrator** (deferred):
- Cloud Scheduler job for periodic invocation (separate infra step; same shape as `mkt-agent-dispatch` for Manus). Needed once for both this AND the Running Promotions automation.
- Multi-sample-per-slot from automation. `samples_per_slot = 1` is MVP — operators run the manual route when they want sibling samples.
- Window-shifting / smart cadence — running every hour with a 24h lookahead means a daily-recurrence event has its slot considered ~24× before the dedupe cuts duplicates. Acceptable for MVP at low query volume.
- A real "system" user via migration — find-first-admin shortcut today.
- Composite index on `Post(brand_id, source_type, source_id, source_instance_key, platform)` — small N, low frequency for now.
- Auto-approval / delivery rows / Manus dispatch — drafts only.

---

## Tab 2: On Going Promotions

API-based promotion detection with per-promo rule configuration.

### Config Shape
```json
{
  "api_url": null,
  "check_schedule": { "weekdays": [6], "time": "09:00" },
  "allow_duplicate_rules": false,
  "promo_rules": [],
  "draft_delay_minutes": 30
}
```

### Promo Rule Shape
```json
{
  "id": "uuid", "promo_id": "from-source", "promo_name": "Promo Name",
  "posting_mode": "daily",
  "recurrence": { "time": "15:00", "weekdays": [1, 3] },
  "sample_count": 3
}
```

### Rules
- Check schedule: configurable weekdays + time (default Saturday 9AM)
- Per-promo posting mode: Start of Promo, Daily, Weekly, Monthly
- Recurrence uses same weekday/month-day/time pattern as Events
- Draft delay: minutes after API check
- Deduplication: toggle for allowing duplicate rule creation

---

## Tab 3: Hot Games

Top-performing games by RTP, single-post output.

### Config Shape
```json
{
  "check_schedule": { "weekdays": [2, 4, 6], "time": "16:00" },
  "source_window_minutes": 120,
  "hot_games_count": 6,
  "time_mapping": ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"],
  "sample_count": 2,
  "dedupe_key": "scan_timestamp"
}
```

### Rules
- Source Window: dropdown — 30 / 60 / 90 / 120 minutes (no other values allowed)
- Hot Games Count: dropdown — 3 to 10 (no other values allowed)
- Time Mapping: operator-defined per rank (Hot 1, Hot 2, ..., Hot N).
  Must be in strictly ascending order. Inline red warning + save blocked if not ascending.
  Row count always equals Hot Games Count.
- Output: 1 post containing all ranked games (not separate posts)
- Each game includes: game icon, provider icon, game name
- Draft creation: immediate after a scan returns a valid snapshot (no delay)
- Sample count: N draft samples
- Deduplication by scan timestamp

### Frozen Snapshot
When the API scan returns the ranked Hot Games batch, that snapshot is frozen and pinned
to the resulting drafts via Post.generation_context_json. When a Hot Games draft is
resent from Content Queue for refinement, the same snapshot is reused — the system does
NOT scan the API again and does NOT replace the games list with a new batch.

Snapshot shape stored on the post:
```json
{
  "type": "hot_games_snapshot",
  "scan_timestamp": "2026-04-18T16:00:00Z",
  "source_window_minutes": 120,
  "ranked_games": [ { "rank": 1, "name": "...", "provider": "...", "icon_url": "..." }, ... ],
  "time_mapping": ["18:00", "19:00", ...]
}
```

---

## Shared Rules

- All 3 types stored in `automation_rules` table (rule_type column)
- Config stored in `config_json` (Json column)
- One rule per type per brand (unique constraint)
- Auto-seeded on first access per brand
- Old config shapes migrated at render time
- brand_manager or admin role required to edit

---

## Rule Types in DB

| rule_type | Label | Status |
|-----------|-------|--------|
| big_win | Big Wins | Active tab |
| running_promotion | On Going Promotions | Active tab |
| hot_games | Hot Games | Active tab |
| educational | Educational Posts | Hidden (data preserved) |
