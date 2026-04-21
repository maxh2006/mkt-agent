import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";

/**
 * POST /api/posts/[id]/deliveries/[platform]/retry
 *
 * Placeholder retry endpoint. Resets a failed delivery back to `queued` and
 * bumps retry_count. The actual Manus dispatcher (follow-up work) picks it up
 * from the queued state and attempts delivery again. Retry reuses the SAME
 * approved content payload — no regeneration, no re-approval, no source re-run.
 *
 * Requires brand_manager or admin role.
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

  const updated = await db.postPlatformDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "queued",
      retry_count: delivery.retry_count + 1,
      last_error: null,
    },
  });

  // TODO: signal the Manus dispatcher (follow-up work). For now the queued state
  // is the only handoff — a future worker poll or webhook picks it up.

  return ok(updated);
}
