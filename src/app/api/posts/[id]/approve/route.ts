import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { isValidTransition } from "@/lib/post-status";

/**
 * POST /api/posts/[id]/approve
 * Approval: records approved_at + approved_by metadata and moves the post
 * directly to `scheduled` (the new visible lifecycle — there is no long-lived
 * `approved` operational state).
 *
 * If the post has no scheduled_at yet, we default it to `now()` so the post is
 * immediately eligible for the publishing step (when Manus is wired).
 *
 * Requires brand_manager or admin role.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;
  const post = await db.post.findFirst({
    where: { id, brand_id: ctx.brand!.id },
  });
  if (!post) return Errors.NOT_FOUND("Post");

  if (!isValidTransition(post.status, "scheduled")) {
    return Errors.INVALID_TRANSITION(post.status, "scheduled");
  }

  const now = new Date();
  const updated = await db.post.update({
    where: { id },
    data: {
      status: "scheduled",
      approved_by: user.id,
      approved_at: now,
      scheduled_at: post.scheduled_at ?? now,
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.POST_APPROVED,
    entity_type: "post",
    entity_id: id,
    before: { status: post.status, scheduled_at: post.scheduled_at },
    after: { status: "scheduled", scheduled_at: updated.scheduled_at, approved_by: user.id },
  });

  return ok(updated);
}
