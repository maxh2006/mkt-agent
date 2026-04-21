import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";

/**
 * POST /api/posts/[id]/deliveries/[platform]/retry
 *
 * Operator retry for a failed platform delivery. Resets the delivery back to
 * `queued` with `scheduled_for = now()` so it's picked up on the next Manus
 * dispatcher tick (Cloud Scheduler fires every 2 minutes in production, see
 * docs/08-deployment.md). Retry reuses the SAME approved content payload —
 * no regeneration, no re-approval, no source re-run.
 *
 * State changes:
 *   status           failed → queued
 *   scheduled_for    → now()
 *   retry_count      += 1
 *   last_error       → null
 *   worker           preserved ("manus")
 *
 * Requires brand_manager or admin role. Writes an audit log entry per call.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; platform: string }> },
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const { id, platform } = await params;

  const post = await db.post.findFirst({
    where: { id, brand_id: ctx.brand!.id },
    select: { id: true },
  });
  if (!post) return Errors.NOT_FOUND("Post");

  const delivery = await db.postPlatformDelivery.findFirst({
    where: { post_id: id, platform: platform as "instagram" | "facebook" | "twitter" | "tiktok" | "telegram" },
  });
  if (!delivery) return Errors.NOT_FOUND("Delivery");

  if (delivery.status !== "failed") {
    return Errors.VALIDATION("Only failed deliveries can be retried");
  }

  const now = new Date();
  const updated = await db.postPlatformDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "queued",
      scheduled_for: now,
      retry_count: delivery.retry_count + 1,
      last_error: null,
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.DELIVERY_RETRIED,
    entity_type: "post_platform_delivery",
    entity_id: delivery.id,
    before: {
      status: delivery.status,
      retry_count: delivery.retry_count,
      last_error: delivery.last_error,
      scheduled_for: delivery.scheduled_for,
    },
    after: {
      status: updated.status,
      retry_count: updated.retry_count,
      last_error: updated.last_error,
      scheduled_for: updated.scheduled_for,
      post_id: id,
      platform,
    },
  });

  return ok(updated);
}
