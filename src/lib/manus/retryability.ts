// Manus delivery failure retryability classifier.
//
// The callback route formats `PostPlatformDelivery.last_error` as
// "[CODE] message" when Manus sends a machine-readable `error_code`.
// This module parses that prefix back out and classifies each failure
// into `retryable` (safe to resend same content) vs `fatal` (operator
// must fix content or configuration before retry makes sense).
//
// Deliberately pure + dependency-free so both the retry API route and
// the Delivery Status modal can consume the same classifier — single
// source of truth, no schema change, derivable from stored data.
//
// See docs/06-workflows-roles.md "Delivery retry classification" for
// the operator-facing flow and docs/00-architecture.md "Manus protocol
// — retryability layer" for the full taxonomy mapping.

import type { ManusErrorCode } from "./types";

/**
 * Codes Manus has classified as transient — retrying the same content
 * is expected to eventually succeed without operator action.
 */
export const RETRYABLE_ERROR_CODES: ReadonlySet<ManusErrorCode> = new Set([
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "TEMPORARY_UPSTREAM_ERROR",
]);

/**
 * Codes where retrying the same content is expected to fail again
 * because the root cause is our payload, our auth, or a platform-side
 * policy rejection. Operator must edit content / fix config /
 * investigate before retry makes sense.
 */
export const FATAL_ERROR_CODES: ReadonlySet<ManusErrorCode> = new Set([
  "AUTH_ERROR",
  "INVALID_PAYLOAD",
  "MEDIA_ERROR",
  "PLATFORM_REJECTED",
]);

// Sanity invariant — the two sets should cover every declared code
// except UNKNOWN_ERROR (handled by the default branch below).
// Build-time only: TypeScript will complain if a new ManusErrorCode is
// added to the union without updating this file.
type _AssertExhaustive = Exclude<
  ManusErrorCode,
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "TEMPORARY_UPSTREAM_ERROR"
  | "AUTH_ERROR"
  | "INVALID_PAYLOAD"
  | "MEDIA_ERROR"
  | "PLATFORM_REJECTED"
  | "UNKNOWN_ERROR"
>;
// If a new ManusErrorCode is added, uncomment to force the compiler to
// point at it: const _check: _AssertExhaustive = "missing code" as never;
// Keeping this as a type-only guard avoids runtime cost.
type _Unused = _AssertExhaustive; // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * Short operator-facing label for each known code. Used in the
 * Delivery Status modal below the error message. Keep concise.
 */
export const ERROR_CODE_LABELS: Record<ManusErrorCode, string> = {
  NETWORK_ERROR: "Network issue",
  RATE_LIMITED: "Rate limited",
  TEMPORARY_UPSTREAM_ERROR: "Temporary platform outage",
  AUTH_ERROR: "Platform authentication",
  INVALID_PAYLOAD: "Payload rejected",
  MEDIA_ERROR: "Media issue",
  PLATFORM_REJECTED: "Platform rejected content",
  UNKNOWN_ERROR: "Unclassified error",
};

/**
 * Discriminated result of classifying a single failure. The UI reads
 * `retryable` + `label` + `hint`; the retry route reads `retryable`
 * only. `code` is null when the stored error came from a legacy
 * delivery that pre-dates the error-code taxonomy.
 *
 * `source`:
 *   - `"classified"` — code was recognized and mapped explicitly
 *   - `"default"`    — code was missing, unknown, or `UNKNOWN_ERROR`;
 *                      we defaulted to retryable (see policy below)
 */
export interface FailureClass {
  retryable: boolean;
  code: ManusErrorCode | null;
  source: "classified" | "default";
  /** Short chip label for UI. */
  label: string;
  /** One-line operator hint for UI. */
  hint: string;
}

/**
 * Pulls the `[CODE]` prefix out of a stored last_error string.
 * Returns null when:
 *   - last_error is null/empty (no failure yet)
 *   - prefix is absent (legacy row, pre-taxonomy Manus callback)
 *   - prefix doesn't match the canonical ManusErrorCode union
 *
 * Format reference: `src/app/api/manus/callback/route.ts#formatLastError`
 * writes `"[CODE] message"` when code is present, plain `"message"`
 * otherwise.
 */
export function parseManusErrorCode(
  last_error: string | null | undefined,
): ManusErrorCode | null {
  if (!last_error) return null;
  const match = /^\[([A-Z_]+)\]/.exec(last_error);
  if (!match) return null;
  const code = match[1];
  if (
    RETRYABLE_ERROR_CODES.has(code as ManusErrorCode) ||
    FATAL_ERROR_CODES.has(code as ManusErrorCode) ||
    code === "UNKNOWN_ERROR"
  ) {
    return code as ManusErrorCode;
  }
  return null; // prefix exists but isn't a known code — treat as legacy/unknown
}

/**
 * MVP default-handling policy for `UNKNOWN_ERROR`, missing codes, and
 * legacy text-only failures:
 *
 *   → classified as `retryable` with a "cause unknown" hint.
 *
 * Rationale:
 *   - Retry route is role-gated (brand_manager / admin) so there's
 *     already an operator-in-the-loop check.
 *   - Policy-level rejections are classified as PLATFORM_REJECTED,
 *     not UNKNOWN, so an unknown code is more likely transient than
 *     a hard reject.
 *   - Blocking retry on legacy rows (no code prefix) would regress
 *     the pre-taxonomy UX without a clear benefit.
 *
 * See `docs/06-workflows-roles.md` — "Delivery retry classification".
 */
export function classifyFailure(
  last_error: string | null | undefined,
): FailureClass {
  const code = parseManusErrorCode(last_error);

  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return {
      retryable: true,
      code,
      source: "classified",
      label: ERROR_CODE_LABELS[code],
      hint: "Retry available — temporary issue.",
    };
  }

  if (code && FATAL_ERROR_CODES.has(code)) {
    return {
      retryable: false,
      code,
      source: "classified",
      label: ERROR_CODE_LABELS[code],
      hint: "Fix content or configuration before retrying.",
    };
  }

  // UNKNOWN_ERROR, unrecognized prefix, or no prefix at all.
  return {
    retryable: true,
    code: code ?? null,
    source: "default",
    label: code ? ERROR_CODE_LABELS[code] : "Cause unknown",
    hint: "Retry available — cause unknown.",
  };
}

/**
 * Operator-facing fatal message for the retry API route's 422 body.
 * Keep short — the UI will render it near the delivery row.
 */
export const FATAL_RETRY_REJECTION_MESSAGE =
  "This delivery failure is not retryable from the delivery modal. Fix content or configuration first.";
