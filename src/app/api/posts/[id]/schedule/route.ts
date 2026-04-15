import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { isValidTransition } from "@/lib/post-status";
import { schedulePostSchema } from "@/lib/validations/post";

/**
 * POST /api/posts/[id]/schedule
 * Transitions post: approved → scheduled
 * Requires brand_manager or admin role.
 * Body: { scheduled_at: ISO 8601 datetime string }
 */
export async function POST(
  req: NextRequest,
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

  const body = await req.json().catch(() => null);
  const parsed = schedulePostSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const scheduledAt = new Date(parsed.data.scheduled_at);
  if (scheduledAt <= new Date()) {
    return Errors.VALIDATION("scheduled_at must be a future datetime");
  }

  const updated = await db.post.update({
    where: { id },
    data: {
      status: "scheduled",
      scheduled_at: scheduledAt,
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.POST_SCHEDULED,
    entity_type: "post",
    entity_id: id,
    before: { status: post.status, scheduled_at: post.scheduled_at },
    after: { status: "scheduled", scheduled_at: scheduledAt },
  });

  return ok(updated);
}
