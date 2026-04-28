import { z } from "zod";
import type { PromoFacts } from "@/lib/ai/types";
import type { PromoAdapterSkippedRow } from "./types";

/**
 * Tolerant per-row parser + envelope handler.
 *
 * Upstream contract is provisional — platform team hasn't published the
 * final promo API shape. We accept both:
 *   A)  { data: Promotion[], meta?: {...} }
 *   B)  Promotion[]
 *
 * Per-row required core fields (for inclusion in `promos`):
 *   id    — `id` | `promo_id` | `promoId` — coerced to string
 *   title — `title` | `name` — non-empty
 *
 * Everything else is best-effort. Rows missing required core fields
 * land in `skipped[]` with a reason; the batch survives.
 */

export interface NormalizeOk {
  kind: "ok";
  promos: PromoFacts[];
  skipped: PromoAdapterSkippedRow[];
}

export interface NormalizeSchemaError {
  kind: "schema_error";
  message: string;
  /** Non-empty only when we found a row array but some rows parsed and
   *  some didn't — partial recovery for caller. */
  promos: PromoFacts[];
  skipped: PromoAdapterSkippedRow[];
}

export interface NormalizeParseError {
  kind: "parse_error";
  message: string;
}

export type NormalizeResult =
  | NormalizeOk
  | NormalizeSchemaError
  | NormalizeParseError;

/** Narrow envelope — any object with a `data` array of unknowns. */
const EnvelopeSchema = z.object({
  data: z.array(z.unknown()),
});

export function normalizePromoPayload(rawBody: string): NormalizeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (err) {
    return {
      kind: "parse_error",
      message: err instanceof Error ? err.message : "Invalid JSON",
    };
  }

  const rows = extractRows(parsed);
  if (!rows) {
    return {
      kind: "schema_error",
      message:
        "Upstream payload was neither an array nor an object with a `data` array",
      promos: [],
      skipped: [],
    };
  }

  const promos: PromoFacts[] = [];
  const skipped: PromoAdapterSkippedRow[] = [];

  for (const raw of rows) {
    const mapped = mapRow(raw);
    if (mapped.ok) promos.push(mapped.value);
    else skipped.push({ reason: mapped.reason, raw });
  }

  return { kind: "ok", promos, skipped };
}

function extractRows(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  const env = EnvelopeSchema.safeParse(parsed);
  if (env.success) return env.data.data;
  return null;
}

// ─── Per-row mapping ────────────────────────────────────────────────────────

type MapResult =
  | { ok: true; value: PromoFacts }
  | { ok: false; reason: string };

function mapRow(raw: unknown): MapResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "row is not a plain object" };
  }
  const r = raw as Record<string, unknown>;

  const promoId = coerceId(r.id ?? r.promo_id ?? r.promoId);
  if (!promoId) {
    return { ok: false, reason: "missing required id (id / promo_id / promoId)" };
  }

  const title = pickString(r.title, r.name);
  if (!title) {
    return { ok: false, reason: "missing required title (title / name)" };
  }

  // Skip inactive / expired promos. Both flags are optional upstream;
  // a row missing them is treated as active+not-expired (back-compat).
  // Skipped rows still surface in `result.skipped[]` with a clear
  // reason so ops can audit "why didn't this promo generate a draft".
  if (r.is_active === false) {
    return { ok: false, reason: "promo inactive (is_active=false)" };
  }
  if (r.is_expired === true) {
    return { ok: false, reason: "promo expired (is_expired=true)" };
  }

  return {
    ok: true,
    value: {
      kind: "promo",
      promo_id: promoId,
      promo_title: title,
      mechanics:
        pickString(r.mechanics, r.description, r.summary) ?? "",
      reward: pickString(r.reward, r.prize) ?? "",
      period_start: toIsoOrNull(r.period_start ?? r.startsAt ?? r.start_date),
      period_end: toIsoOrNull(r.period_end ?? r.endsAt ?? r.end_date),
      min_deposit: toNumberOrNull(r.min_deposit ?? r.minimum_deposit),
      terms_summary:
        pickString(r.terms, r.terms_summary, r.tnc) ?? null,
    },
  };
}

function coerceId(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length) return t;
    }
  }
  return null;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toIsoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v.toISOString() : null;
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const d = new Date(t);
    const ms = d.getTime();
    return Number.isFinite(ms) ? d.toISOString() : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    const ms = d.getTime();
    return Number.isFinite(ms) ? d.toISOString() : null;
  }
  return null;
}
