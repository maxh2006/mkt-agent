// Canonical references for the shared BigQuery dataset owned by the
// platform team (Newgen). All BQ adapter code MUST import from here
// rather than hard-coding strings — keeps rename / migration paths
// surgical and makes billing-project mistakes impossible.
//
// CRITICAL BILLING RULE
// ---------------------
// BigQuery charges the project that RUNS the query, not the project
// that OWNS the data. The client in `./client.ts` pins the runner
// project to `mktagent-493404` for every query. Tables referenced
// here live in `newgen-492518:shared` — always fully qualified.
//
// See docs/bq-shared-schema.md for the full cheat sheet.

/** Project that OWNS the shared dataset (data-owner — billed nothing). */
export const SHARED_PROJECT = "newgen-492518";

/** Dataset name inside SHARED_PROJECT. */
export const SHARED_DATASET = "shared";

/** Project we RUN queries under — this is the billing/job-running project. */
export const BILLING_PROJECT = "mktagent-493404";

/**
 * Fully qualified table refs — interpolate directly into SQL. Each value
 * is wrapped in backticks so it's safe to drop into a query body:
 *
 *   const sql = `SELECT COUNT(*) FROM ${SHARED_TABLES.users}`;
 *
 * Never remove the backticks or strip the project prefix — the unqualified-
 * table guardrail in `runQuery()` will reject such queries, but there's no
 * substitute for habit.
 */
export const SHARED_TABLES = {
  brands:       "`newgen-492518.shared.brands`",
  users:        "`newgen-492518.shared.users`",
  transactions: "`newgen-492518.shared.transactions`",
  game_rounds:  "`newgen-492518.shared.game_rounds`",
  games:        "`newgen-492518.shared.games`",
} as const;

/** Narrow set of table name keys — used by the guardrail + smoke test. */
export type SharedTableName = keyof typeof SHARED_TABLES;

/** Ordered list of table names — useful for smoke tests + schema audits. */
export const SHARED_TABLE_NAMES: readonly SharedTableName[] = [
  "brands",
  "users",
  "transactions",
  "game_rounds",
  "games",
] as const;
