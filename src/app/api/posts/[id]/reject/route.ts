import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { isValidTransition } from "@/lib/post-status";

const bodySchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/posts/[id]/reject
 * Transitions post: pending_approval → rejected
 * Requires brand_manager or admin role.
 * Accepts an optional rejection reason in the body.
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

  if (!isValidTransition(post.status, "rejected")) {
    return Errors.INVALID_TRANSITION(post.status, "rejected");
  }

  const body = await req.json().catch(() => ({}));
  const { reason } = bodySchema.parse(body);

  const updated = await db.post.update({
    where: { id },
    data: {
      status: "rejected",
      rejected_reason: reason ?? null,
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.POST_REJECTED,
    entity_type: "post",
    entity_id: id,
    before: { status: post.status },
    after: { status: "rejected", reason },
  });

  return ok(updated);
}
