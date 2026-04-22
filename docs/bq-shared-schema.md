# BQ shared schema cheat sheet

Source-of-truth reference for the Newgen shared BigQuery dataset this
app reads from. Keep this doc short — code constants in
[`src/lib/bq/shared-schema.ts`](../src/lib/bq/shared-schema.ts) are the
authoritative values; this file is the operator-facing summary.

---

## ⚠ Critical billing rule

**BigQuery charges the project that RUNS the query, not the project
that OWNS the data.** Every query this app makes against the shared
dataset MUST run under `mktagent-493404` (our project). If callers
bypass the helper and run unqualified queries from their own tooling,
the bill routes to the platform team — don't let that happen.

- `bq` CLI: always pass `--project_id=mktagent-493404`
- Python SDK: `bigquery.Client(project="mktagent-493404", ...)`
- Node SDK: `new BigQuery({ projectId: "mktagent-493404", ... })`

The Node client at [`src/lib/bq/client.ts`](../src/lib/bq/client.ts)
pins the project at construction and exposes a `runQuery()` wrapper so
application code cannot forget. Use it.

---

## Projects + dataset

| Purpose              | Value                                                  |
|----------------------|--------------------------------------------------------|
| Data-owning project  | `newgen-492518` (platform team — we have read only)    |
| Dataset              | `shared`                                               |
| Refresh cadence      | hourly (Asia/Seoul)                                    |
| Our billing project  | `mktagent-493404` (every job runs here)                |
| Service account      | `mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com` |
| Granted role         | `roles/bigquery.dataViewer` on `newgen-492518:shared`  |

Fully qualified table refs — never drop the project prefix:

| Table          | Fully qualified                       |
|----------------|---------------------------------------|
| `brands`       | `` `newgen-492518.shared.brands` ``       |
| `users`        | `` `newgen-492518.shared.users` ``        |
| `transactions` | `` `newgen-492518.shared.transactions` `` |
| `game_rounds`  | `` `newgen-492518.shared.game_rounds` `` (⚠ not yet created by platform) |
| `games`        | `` `newgen-492518.shared.games` ``        |

---

## Verified example queries

### CLI (mandatory form)

```bash
bq query --nouse_legacy_sql --project_id=mktagent-493404 \
  'SELECT COUNT(*) AS n FROM `newgen-492518.shared.users`'
```

**Verified 2026-04-22:** returns `n=114`. The `--project_id` flag is
what pins billing.

### Node SDK via the helper

```ts
import { runQuery } from "@/lib/bq/client";
import { SHARED_TABLES } from "@/lib/bq/shared-schema";
import type { UserRow, GameRoundRow } from "@/lib/bq/shared-types";

// Counting (simple + untyped)
const [{ n }] = await runQuery<{ n: number | string }>(
  `SELECT COUNT(*) AS n FROM ${SHARED_TABLES.users}`,
);

// Typed rows — use the interfaces from shared-types.ts for adapter code
const users = await runQuery<UserRow>(
  `SELECT * FROM ${SHARED_TABLES.users} WHERE brand_id = @brand LIMIT 10`,
  { params: { brand: "brand-abc" } },
);

// game_rounds is still pending on the platform side, but the type
// exists today so Big Wins / Hot Games adapter code compiles:
async function fetchRecentBigWins(brandId: string): Promise<GameRoundRow[]> {
  return runQuery<GameRoundRow>(
    `SELECT * FROM ${SHARED_TABLES.game_rounds}
     WHERE brand_id = @b AND status = 'settled'
     ORDER BY settled_at DESC LIMIT 50`,
    { params: { b: brandId } },
  );
}
```

`runQuery()` rejects SQL that references any known shared table without
the `newgen-492518.shared.` prefix — this catches the most common
"forgot to fully qualify" mistake at the boundary, before the job runs.
The smoke test exercises the guardrail on every run (5 intentionally-
malformed queries), so regressions surface instantly.

Row interfaces live in
[`src/lib/bq/shared-types.ts`](../src/lib/bq/shared-types.ts):
`BrandRow`, `UserRow`, `TransactionRow`, `GameRoundRow`, `GameRow`.
They mirror this cheat sheet. Extra columns seen in live data
(fixture captures them) aren't typed — add fields to the interfaces as
adapter code needs them. `GameRoundRow` is provisional until the
platform team ships the table (see banner in the file).

### Full smoke test

```bash
# PowerShell
$env:BQ_IMPERSONATE_SA = "mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com"
npm run bq:smoke

# bash (msys / WSL)
BQ_IMPERSONATE_SA=mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com npm run bq:smoke
```

Hits all 5 tables (COUNT + first-row sample), writes results to
[`fixtures/bq-shared-schema.json`](../fixtures/bq-shared-schema.json).
Diff that file against future runs to catch schema drift.

---

## Schema cheat sheet

Operator-facing summary of what each table is for + the columns the AI
agent layer + automation scans depend on. Authoritative column lists
live in the fixture — re-run `npm run bq:smoke` if you need to confirm
something.

### `shared.brands`

Join target for every other table via `brand_id`. Our own brand records
live in this app's Postgres; `shared.brands` is Newgen's view of the
same brands.

- `id`
- `name`
- `slug`
- `country_code`
- `currency_code`

### `shared.users` — user segments + lifecycle

- `id`
- `username`
- `display_name`
- `brand_id`
- `level`
- `tags`
- `country_code`
- `telco`
- `channel`
- `balance`
- `total_deposit`
- `total_withdrawal`
- `deposit_count`
- `withdrawal_count`
- `is_active`
- `last_login_at`
- `created_at`
- `updated_at`

### `shared.transactions` — completed deposits + withdrawals only

- `user_id`
- `type` (`'deposit'` | `'withdrawal'`)
- `status` (always `'completed'`)
- `amount`
- `balance_before`
- `balance_after`
- `created_at`
- `finalized_at`

Notes:
- Bets / wins are **NOT** here
- No pending / refund rows here
- Game money activity lives in `shared.game_rounds`

### `shared.game_rounds`

- `user_id`
- `brand_id`
- `game_code`
- `category`
- `bet_amount`
- `payout_amount`
- `ggr`
- `valid_bet`
- `win_multiplier`
- `status` (`'pending'` | `'settled'` | `'refunded'` | `'reclaimed'`)
- `bet_at`
- `settled_at`

⚠ **Not yet created by the platform team** (as of 2026-04-22). Required
for Big Wins and Hot Games automation adapters. Table existence is
smoke-tested; constant already present in `SHARED_TABLES` so adapter
code can be written ahead of the table landing.

### `shared.games`

- `id`
- `vendor`
- `tg_game_code`
- `tg_game_provider`
- `name`
- `display_name`
- `category`
- `rtp`
- `game_icon` (public URL)
- `is_active`

---

## Verified 2026-04-22 — live snapshot

Row counts as of the last smoke test run (see the fixture for the full
column list per table — the live schema has a handful more columns than
the cheat sheet above lists, which is expected and fine).

| Table          | Status   | Rows  | Cols |
|----------------|----------|-------|------|
| `brands`       | ok       | 5     | 9    |
| `users`        | ok       | 114   | 25   |
| `transactions` | ok       | 17    | 13   |
| `game_rounds`  | missing  | —     | —    |
| `games`        | ok       | 4,963 | 12   |

Extra columns seen in live data (all normal — tables are growing):
- `brands` — has `admin_color`, `created_at`, `updated_at` on top of the cheat sheet fields
- `users` — has `phone_verified`, `email_verified`, `scheduled_reval_at`, others
- `transactions` — has `updated_at` etc.
- `games` — has `created_at`, `type` etc.

---

## Write policy

**Writes are out of scope and blocked at the IAM level.** The SA has
`roles/bigquery.dataViewer` only — any `INSERT` / `UPDATE` / `DELETE` /
`CREATE TABLE` / `LOAD` against `newgen-492518:shared` will 403. Do not
try to work around it. If you need to persist something, it belongs in
this app's Postgres, not in the shared dataset.

## Requesting schema changes

New columns, new views, new tables → platform team request. This repo
should never author migrations against the shared dataset. When a new
column / table lands:

1. Platform team confirms the schema is live.
2. Run `npm run bq:smoke` → diff the updated fixture against the
   previous one.
3. Update `SHARED_TABLES` + this cheat sheet if the table name or role
   changes.
4. Update adapter code that depends on the new shape.

---

## Auth paths

| Environment | How the SDK authenticates                                                                                                                  |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Local dev   | Set `BQ_IMPERSONATE_SA=mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com` — client impersonates the SA via `google-auth-library`'s `Impersonated`. Requires `roles/iam.serviceAccountTokenCreator` on the SA for your user. |
| Prod VM     | **Follow-up task** — attach `mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com` to the Compute Engine VM as its runtime SA. With the env unset, the client falls through to ambient ADC and prod picks up the attached SA automatically. No key files on disk. |

The `iamcredentials.googleapis.com` API must be enabled on
`mktagent-493404` for impersonation to work — enabled 2026-04-22.
