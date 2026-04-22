/**
 * scripts/bq-smoke-test.ts
 *
 * End-to-end verification that `src/lib/bq/client.ts` can talk to the
 * shared BigQuery dataset, and a lightweight fixture writer so future
 * runs can diff against today's schema snapshot.
 *
 * For each of the 5 shared tables it runs:
 *   1. `SELECT COUNT(*) AS n FROM <table>`
 *   2. `SELECT * FROM <table> LIMIT 1`
 *
 * Output is:
 *   - printed to stdout (human-readable)
 *   - written to `fixtures/bq-shared-schema.json` (timestamped snapshot
 *     with row counts + column names + first-row sample + column types).
 *
 * Usage (local dev, via gcloud SA impersonation):
 *
 *   # PowerShell
 *   $env:BQ_IMPERSONATE_SA = "mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com"
 *   npx tsx scripts/bq-smoke-test.ts
 *
 *   # bash / msys
 *   BQ_IMPERSONATE_SA=mkt-agent-bq@mktagent-493404.iam.gserviceaccount.com \
 *     npx tsx scripts/bq-smoke-test.ts
 *
 * On prod (VM with attached SA): leave BQ_IMPERSONATE_SA unset; the
 * client falls through to default ADC.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runQuery } from "../src/lib/bq/client";
import {
  BILLING_PROJECT,
  SHARED_DATASET,
  SHARED_PROJECT,
  SHARED_TABLES,
  SHARED_TABLE_NAMES,
  type SharedTableName,
} from "../src/lib/bq/shared-schema";

interface TableSample {
  table: SharedTableName;
  fully_qualified: string;
  status: "ok" | "missing" | "error";
  row_count: number | null;
  column_count: number | null;
  columns: string[];
  first_row: Record<string, unknown> | null;
  error?: string;
}

interface Fixture {
  generated_at: string;
  billing_project: string;
  shared_project: string;
  shared_dataset: string;
  impersonated_sa: string | null;
  tables: TableSample[];
}

const FIXTURE_PATH = resolve(__dirname, "../fixtures/bq-shared-schema.json");

/**
 * Boundary-layer guardrail self-test.
 *
 * Confirms that `runQuery()` rejects SQL referencing any of the 5 shared
 * tables without the `newgen-492518.shared.` prefix — BEFORE hitting
 * BigQuery. Runs on every smoke-test invocation so a regression in the
 * guardrail (e.g. someone weakens the regex) is caught instantly.
 *
 * Particularly important for `game_rounds`: that table doesn't exist
 * live yet, but when it lands we want the first adapter-code query
 * that forgets the prefix to be caught HERE, not at cost after jobs
 * start running.
 */
async function runGuardrailSelfTest(): Promise<void> {
  const badQueries: Array<{ name: string; sql: string }> = [
    { name: "unqualified game_rounds (FROM)", sql: "SELECT COUNT(*) FROM game_rounds" },
    { name: "unqualified users (JOIN)",       sql: "SELECT u.id FROM `newgen-492518.shared.brands` b JOIN users u ON u.brand_id = b.id" },
    { name: "unqualified transactions (FROM)", sql: "SELECT COUNT(*) FROM transactions" },
    { name: "unqualified games (FROM)",        sql: "SELECT COUNT(*) FROM games" },
    { name: "unqualified brands (FROM)",       sql: "SELECT COUNT(*) FROM brands" },
  ];

  for (const { name, sql } of badQueries) {
    let threw = false;
    try {
      await runQuery(sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("BQ guardrail")) threw = true;
      else {
        throw new Error(
          `Guardrail self-test for "${name}" threw, but not the expected guardrail error: ${msg}`,
        );
      }
    }
    if (!threw) {
      throw new Error(
        `Guardrail self-test FAILED for "${name}" — unqualified SQL was not rejected. ` +
          `src/lib/bq/client.ts#assertQueriesAreQualified is weaker than intended.`,
      );
    }
  }

  console.log(`✓ guardrail self-test passed (${badQueries.length} checks — unqualified refs rejected at boundary)`);
}


async function main(): Promise<void> {
  console.log("─".repeat(72));
  console.log("BQ smoke test");
  console.log("  billing/job project : ", BILLING_PROJECT);
  console.log("  data-owning project : ", SHARED_PROJECT);
  console.log("  dataset             : ", SHARED_DATASET);
  console.log(
    "  impersonated SA     : ",
    process.env.BQ_IMPERSONATE_SA || "(none — default ADC)",
  );
  console.log("─".repeat(72));

  await runGuardrailSelfTest();

  const samples: TableSample[] = [];
  for (const tableName of SHARED_TABLE_NAMES) {
    const sample = await smokeOne(tableName);
    samples.push(sample);
    printSample(sample);
  }

  const missing = samples.filter((s) => s.status === "missing");
  const errored = samples.filter((s) => s.status === "error");
  if (missing.length > 0) {
    console.log("");
    console.log(
      `⚠  ${missing.length} table(s) not yet in dataset — platform TODO: ${missing.map((s) => s.table).join(", ")}`,
    );
  }
  if (errored.length > 0) {
    console.log("");
    console.log(
      `❌  ${errored.length} table(s) failed for a non-"missing" reason: ${errored.map((s) => s.table).join(", ")}`,
    );
  }

  const fixture: Fixture = {
    generated_at: new Date().toISOString(),
    billing_project: BILLING_PROJECT,
    shared_project: SHARED_PROJECT,
    shared_dataset: SHARED_DATASET,
    impersonated_sa: process.env.BQ_IMPERSONATE_SA || null,
    tables: samples,
  };

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + "\n", "utf8");

  console.log("─".repeat(72));
  console.log(`Fixture written: ${FIXTURE_PATH}`);
  console.log("─".repeat(72));
}

async function smokeOne(name: SharedTableName): Promise<TableSample> {
  const ref = SHARED_TABLES[name];
  try {
    const [countRow] = await runQuery<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM ${ref}`,
    );
    const rowCount = Number(countRow?.n ?? 0);

    const rows = await runQuery<Record<string, unknown>>(
      `SELECT * FROM ${ref} LIMIT 1`,
    );
    const first = rows[0] ?? null;
    const columns = first ? Object.keys(first) : [];

    return {
      table: name,
      fully_qualified: ref,
      status: "ok",
      row_count: rowCount,
      column_count: columns.length,
      columns,
      // Lightweight — trim long string fields so fixtures stay compact and
      // don't accidentally expose long-tail data in the committed JSON.
      first_row: first ? trimRow(first) : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // "Not found: Table ... was not found in location ..." → table simply
    // doesn't exist yet in the shared dataset. Reported as `missing`,
    // surfaced as a warning, does NOT fail the run.
    const isMissing = /Not found: Table/i.test(message);
    return {
      table: name,
      fully_qualified: ref,
      status: isMissing ? "missing" : "error",
      row_count: null,
      column_count: null,
      columns: [],
      first_row: null,
      error: message.split("\n")[0] ?? message,
    };
  }
}

function trimRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = trimValue(v);
  }
  return out;
}

function trimValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return v.length > 200 ? v.slice(0, 200) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.slice(0, 10).map(trimValue);
  if (typeof v === "object") {
    // BigQuery returns special objects (e.g. Big.js numeric, timestamp
    // wrappers) — stringify defensively so the fixture is pure JSON.
    try {
      const asJson = JSON.parse(JSON.stringify(v));
      return asJson;
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function printSample(s: TableSample): void {
  console.log("");
  if (s.status === "missing") {
    console.log(`${s.table.padEnd(14)} → ⚠  not yet in dataset (platform TODO)`);
    return;
  }
  if (s.status === "error") {
    console.log(`${s.table.padEnd(14)} → ❌ ${s.error ?? "error"}`);
    return;
  }
  console.log(
    `${s.table.padEnd(14)} → rows: ${(s.row_count ?? 0).toLocaleString()}   cols: ${s.column_count ?? 0}`,
  );
  if (s.first_row) {
    const preview = Object.entries(s.first_row)
      .slice(0, 6)
      .map(([k, v]) => {
        const rendered =
          typeof v === "string" ? `"${v.slice(0, 40)}"` : JSON.stringify(v);
        return `${k}=${rendered}`;
      })
      .join(", ");
    const colCount = s.column_count ?? 0;
    const more = colCount > 6 ? `  (+${colCount - 6} more cols)` : "";
    console.log(`  first row: ${preview}${more}`);
  } else {
    console.log("  first row: (table empty)");
  }
}

main().catch((err) => {
  console.error("\n❌ BQ smoke test failed:");
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
