import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyManusSignature } from "@/lib/manus/signature";
import { reconcilePostStatus } from "@/lib/manus/reconcile";

/**
 * POST /api/manus/callback
 *
 * Manus posts per-platform delivery results here. Auth is HMAC-SHA256 over
 * the raw request body with `MANUS_WEBHOOK_SECRET`, sent in
 * `x-manus-signature: sha256=<hex>`. Session middleware is bypassed
 * (see src/proxy.ts matcher exclusion for `api/manus`).
 *
 * Responsibilities:
 *  1. Verify signature over the raw body.
 *  2. Parse + validate payload.
 *  3. Look up the PostPlatformDelivery (correlation key = delivery_id).
 *  4. Apply the terminal outcome idempotently.
 *  5. Reconcile parent Post.status via computePostStatusFromDeliveries().
 *
 * The route never regenerates content, re-approves, or re-runs source logic.
 */

const PLATFORMS = ["instagram", "facebook", "twitter", "tiktok", "telegram"] as const;

// Callback schema — see `ManusCallbackPayload` in src/lib/manus/types.ts and
// docs/00-architecture.md "Manus protocol — finalized contract". `error_code`
// is intentionally typed as `z.string()` (not z.enum) so unknown taxonomy
// codes don't reject the callback — forward compatibility over strictness.
const CallbackSchema = z.object({
  delivery_id: z.string().min(1),
  post_id: z.string().min(1).optional(),
  platform: z.enum(PLATFORMS).optional(),
  outcome: z.enum(["posted", "failed"]),
  external_post_id: z.string().optional(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  external_ref: z.string().optional(),
  attempted_at: z.string().datetime().optional(),
});

/**
 * Formats the failure text stored in PostPlatformDelivery.last_error.
 *
 * When Manus sends a machine-readable error_code, we prefix the human
 * message so the combined string stays human-readable AND regex-parseable:
 *   "[RATE_LIMITED] Meta graph API 429"
 *
 * No DB column for error_code in MVP — this format keeps schema flat while
 * preserving classification info. Revisit if filter-by-code becomes common.
 */
function formatLastError(message: string | undefined, code: string | undefined): string {
  const msg = message ?? "Unknown error";
  return code ? `[${code}] ${msg}` : msg;
}

export async function POST(req: NextRequest) {
  const secret = process.env.MANUS_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[manus-callback] REJECTED: MANUS_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Manus webhook not configured" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-manus-signature");

  if (!verifyManusSignature(rawBody, signature, secret)) {
    console.warn(`[manus-callback] REJECTED: signature verification failed`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CallbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  const delivery = await db.postPlatformDelivery.findUnique({
    where: { id: payload.delivery_id },
  });
  if (!delivery) {
    console.warn(`[manus-callback] delivery=${payload.delivery_id} not found`);
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }

  if (payload.post_id && payload.post_id !== delivery.post_id) {
    console.warn(
      `[manus-callback] post_id mismatch delivery=${delivery.id} expected=${delivery.post_id} got=${payload.post_id}`,
    );
    return NextResponse.json({ error: "post_id mismatch" }, { status: 409 });
  }
  if (payload.platform && payload.platform !== delivery.platform) {
    console.warn(
      `[manus-callback] platform mismatch delivery=${delivery.id} expected=${delivery.platform} got=${payload.platform}`,
    );
    return NextResponse.json({ error: "platform mismatch" }, { status: 409 });
  }

  const attemptedAt = payload.attempted_at
    ? new Date(payload.attempted_at)
    : new Date();

  let idempotent = false;
  let refused = false;

  // Idempotency matrix — see plan docs for full truth table.
  if (delivery.status === "posted" && payload.outcome === "posted") {
    // Already-posted + posted: idempotent. Fill in external_post_id if we
    // didn't capture it before; otherwise no DB write.
    idempotent = true;
    if (!delivery.external_post_id && payload.external_post_id) {
      await db.postPlatformDelivery.update({
        where: { id: delivery.id },
        data: { external_post_id: payload.external_post_id },
      });
    }
  } else if (delivery.status === "posted" && payload.outcome === "failed") {
    // Posted → failed regression refused. Return 200 so Manus doesn't keep retrying.
    idempotent = true;
    refused = true;
    console.warn(
      `[manus-callback] REFUSED regress: delivery=${delivery.id} already posted; ignoring failed callback`,
    );
  } else if (delivery.status === "failed" && payload.outcome === "failed") {
    // Repeat failed callback: refresh last_error + attempted timestamp only
    // if Manus actually re-sent error info AND it differs from stored. If
    // Manus sends no error/error_code, we preserve the existing last_error
    // rather than clobbering it with null. retry_count is NOT touched here
    // (operator-driven).
    idempotent = true;
    if (payload.error || payload.error_code) {
      const incomingLastError = formatLastError(payload.error, payload.error_code);
      if (delivery.last_error !== incomingLastError) {
        await db.postPlatformDelivery.update({
          where: { id: delivery.id },
          data: {
            last_error: incomingLastError,
            publish_attempted_at: attemptedAt,
          },
        });
      }
    }
  } else if (payload.outcome === "posted") {
    // Full success update (covers queued/scheduled/publishing → posted, and
    // failed → posted if Manus's internal retry succeeded).
    await db.postPlatformDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "posted",
        posted_at: attemptedAt,
        publish_attempted_at: delivery.publish_attempted_at ?? attemptedAt,
        external_post_id: payload.external_post_id ?? null,
        last_error: null,
      },
    });
  } else {
    // Full failure update (covers queued/scheduled/publishing → failed).
    await db.postPlatformDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        publish_attempted_at: attemptedAt,
        last_error: formatLastError(payload.error, payload.error_code),
      },
    });
  }

  // Skip parent reconciliation on refused regressions (no delivery state changed).
  const postStatus = refused ? null : await reconcilePostStatus(delivery.post_id);

  const refParts = [
    payload.error_code ? `error_code=${payload.error_code}` : null,
    payload.external_ref ? `external_ref=${payload.external_ref}` : null,
  ].filter(Boolean).join(" ");
  const refSuffix = refParts ? ` ${refParts}` : "";

  console.log(
    `[manus-callback] delivery=${delivery.id} platform=${delivery.platform} outcome=${payload.outcome} post=${delivery.post_id} sig_ok=true idempotent=${idempotent}${refused ? " refused=true" : ""} post_status=${postStatus ?? "unchanged"}${refSuffix}`,
  );

  return NextResponse.json({
    ok: true,
    idempotent,
    refused,
    delivery_id: delivery.id,
    post_id: delivery.post_id,
    platform: delivery.platform,
    applied_status: refused ? delivery.status : payload.outcome,
    post_status: postStatus,
  });
}
