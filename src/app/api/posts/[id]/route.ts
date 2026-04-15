import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanEdit } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { updatePostSchema } from "@/lib/validations/post";

// ─── GET /api/posts/[id] — fetch a single post ────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);

  const { id } = await params;
  const post = await db.post.findFirst({
    where: { id, brand_id: { in: ctx.brandIds } },
    include: {
      creator: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      metrics_rollup: true,
    },
  });
  if (!post) return Errors.NOT_FOUND("Post");

  return ok(post);
}

// ─── PATCH /api/posts/[id] — update post fields ───────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanEdit(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;
  const existing = await db.post.findFirst({
    where: { id, brand_id: ctx.brand!.id },
  });
  if (!existing) return Errors.NOT_FOUND("Post");

  // Only editable when in draft or rejected state
  if (existing.status !== "draft" && existing.status !== "rejected") {
    return Errors.VALIDATION(
      `Post in status "${existing.status}" cannot be edited. Move it back to draft first.`
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updatePostSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const updated = await db.post.update({
    where: { id },
    data: parsed.data,
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.POST_UPDATED,
    entity_type: "post",
    entity_id: id,
    before: {
      headline: existing.headline,
      caption: existing.caption,
      cta: existing.cta,
      banner_text: existing.banner_text,
    },
    after: parsed.data,
  });

  return ok(updated);
}
