import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { isValidTransition } from "@/lib/post-status";

/**
 * POST /api/posts/[id]/approve
 * Transitions post: pending_approval → approved
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
  if (!ctx) return Errors.NO_ACTIVE_BRAND();
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;
  const post = await db.post.findFirst({
    where: { id, brand_id: ctx.brand.id },
  });
  if (!post) return Errors.NOT_FOUND("Post");

  if (!isValidTransition(post.status, "approved")) {
    return Errors.INVALID_TRANSITION(post.status, "approved");
  }

  const updated = await db.post.update({
    where: { id },
    data: {
      status: "approved",
      approved_by: user.id,
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand.id,
    user_id: user.id,
    action: AuditAction.POST_APPROVED,
    entity_type: "post",
    entity_id: id,
    before: { status: post.status },
    after: { status: "approved", approved_by: user.id },
  });

  return ok(updated);
}
