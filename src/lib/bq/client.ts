import { BigQuery } from "@google-cloud/bigquery";
import { GoogleAuth, Impersonated } from "google-auth-library";
import {
  BILLING_PROJECT,
  SHARED_DATASET,
  SHARED_PROJECT,
  SHARED_TABLE_NAMES,
} from "./shared-schema";

/**
 * Shared BigQuery client — singleton, billing-project-locked.
 *
 * CRITICAL BILLING RULE (see docs/bq-shared-schema.md):
 *   BigQuery charges the project that RUNS the query, not the project
 *   that OWNS the data. This module pins the runner/billing project to
 *   `mktagent-493404` at client construction. Callers cannot accidentally
 *   bill the platform team.
 *
 * Authentication strategy (two paths; the module picks automatically):
 *   - `BQ_IMPERSONATE_SA` env set (local dev pattern)
 *       → impersonate that service account via google-auth-library's
 *         `Impersonated`, using the ambient ADC as the source. The user
 *         needs `roles/iam.serviceAccountTokenCreator` on the target SA.
 *   - env unset (prod VM pattern)
 *       → use default ADC directly. Intended for a GCE VM that has the
 *         `mkt-agent-bq` service account attached as its runtime identity.
 *
 * Scope: `bigquery.dataViewer` on `newgen-492518:shared` is currently the
 * only permission the target SA holds. Writes to the shared dataset are
 * blocked at the IAM level — do not try to work around them.
 */

const IMPERSONATE_SA_ENV = "BQ_IMPERSONATE_SA";
const BQ_SCOPES = ["https://www.googleapis.com/auth/bigquery"];
const DEFAULT_JOB_TIMEOUT_MS = 30_000;

let clientPromise: Promise<BigQuery> | null = null;

async function buildClient(): Promise<BigQuery> {
  const impersonateSa = process.env[IMPERSONATE_SA_ENV]?.trim();

  if (!impersonateSa) {
    // Prod path: rely on ambient ADC (attached VM SA, key file, etc.).
    return new BigQuery({ projectId: BILLING_PROJECT });
  }

  // Local-dev path: mint tokens as the target SA via impersonation.
  const sourceClient = await new GoogleAuth({ scopes: BQ_SCOPES }).getClient();
  const impersonated = new Impersonated({
    sourceClient,
    targetPrincipal: impersonateSa,
    targetScopes: BQ_SCOPES,
    lifetime: 3600,
  });

  return new BigQuery({
    projectId: BILLING_PROJECT,
    authClient: impersonated as unknown as BigQueryAuthClient,
  });
}

/**
 * Lazy singleton. The first caller pays the auth setup; subsequent callers
 * reuse the resolved client. Tests that need a fresh client can call
 * `resetBigQueryClient()`.
 */
export function getBigQueryClient(): Promise<BigQuery> {
  if (!clientPromise) clientPromise = buildClient();
  return clientPromise;
}

/**
 * Reset the singleton. Intended for tests; callers in application code
 * should not need this.
 */
export function resetBigQueryClient(): void {
  clientPromise = null;
}

/**
 * Run a SQL query under the billing-project-locked client.
 *
 * Defaults:
 *   - `useLegacySql: false` (standard SQL is the only sane choice)
 *   - `jobTimeoutMs: 30s`
 *
 * Guardrail: rejects SQL that references a known shared table without
 * the `newgen-492518.shared.` prefix. Catches the common
 * "forgot to fully qualify" mistake that would otherwise either 404 or,
 * worse, silently query a same-named table in some other dataset the SA
 * happens to have access to later.
 */
export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  options: {
    params?: Record<string, unknown>;
    jobTimeoutMs?: number;
  } = {},
): Promise<T[]> {
  assertQueriesAreQualified(sql);

  const bq = await getBigQueryClient();
  const [rows] = await bq.query({
    query: sql,
    params: options.params,
    useLegacySql: false,
    jobTimeoutMs: options.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
  });
  return rows as T[];
}

/**
 * Throws when the SQL references a known shared table (users, transactions,
 * game_rounds, games, brands) without the `newgen-492518.shared.` prefix.
 *
 * Heuristic — deliberately simple. Walks the known-table list and looks
 * for `FROM <name>` or `JOIN <name>` followed by a non-identifier char or
 * end-of-string. If the prefix `newgen-492518.shared.` is within 32 chars
 * before the match, that's qualified; otherwise it's not. False positives
 * are possible (e.g. a comment saying "FROM users table") but easily
 * worked around by qualifying the real reference, and false negatives on
 * unqualified references are the thing we're trying to catch.
 */
function assertQueriesAreQualified(sql: string): void {
  const normalized = sql.replace(/\s+/g, " ").toLowerCase();

  for (const name of SHARED_TABLE_NAMES) {
    const pattern = new RegExp(
      `\\b(?:from|join)\\s+\`?([a-z0-9_.\\-]*?)${name}\\b\`?`,
      "g",
    );
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const prefix = match[1] ?? "";
      const qualified =
        prefix.includes(`${SHARED_PROJECT}.${SHARED_DATASET}.`) ||
        prefix.includes(`${SHARED_PROJECT.toLowerCase()}.${SHARED_DATASET}.`);
      if (!qualified) {
        throw new Error(
          `BQ guardrail: SQL references \`${name}\` without the \`${SHARED_PROJECT}.${SHARED_DATASET}.\` prefix. ` +
            `Import SHARED_TABLES from "@/lib/bq/shared-schema" and interpolate those values instead.`,
        );
      }
    }
  }
}

/**
 * Structural slice of @google-cloud/bigquery's `authClient` option —
 * library's type is internal; a narrow alias keeps our intent explicit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BigQueryAuthClient = any;

/** Exported for tests / docs generators. */
export const __bq_client_internals__ = {
  BILLING_PROJECT,
  IMPERSONATE_SA_ENV,
  assertQueriesAreQualified,
};
