import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanEdit } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import {
  createPostSchema,
  listPostsQuerySchema,
} from "@/lib/validations/post";

// ─── POST /api/posts — create a draft post ────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();
  if (!assertCanEdit(ctx)) return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const post = await db.post.create({
    data: {
      brand_id: ctx.brand.id,
      created_by: user.id,
      status: "draft",
      tracking_id: crypto.randomUUID(),
      ...parsed.data,
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand.id,
    user_id: user.id,
    action: AuditAction.POST_CREATED,
    entity_type: "post",
    entity_id: post.id,
    after: { status: post.status, post_type: post.post_type, platform: post.platform },
  });

  return ok(post, 201);
}

// ─── GET /api/posts — list posts for the active brand ─────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();

  const { searchParams } = new URL(req.url);
  const queryParsed = listPostsQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!queryParsed.success) {
    return Errors.VALIDATION(queryParsed.error.issues[0]?.message ?? "Invalid query");
  }

  const { status, platform, post_type, page, per_page } = queryParsed.data;

  const [posts, total] = await Promise.all([
    db.post.findMany({
      where: {
        brand_id: ctx.brand.id,
        ...(status && { status }),
        ...(platform && { platform }),
        ...(post_type && { post_type }),
      },
      orderBy: { created_at: "desc" },
      skip: (page - 1) * per_page,
      take: per_page,
      include: {
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    }),
    db.post.count({
      where: {
        brand_id: ctx.brand.id,
        ...(status && { status }),
        ...(platform && { platform }),
        ...(post_type && { post_type }),
      },
    }),
  ]);

  return ok({ posts, total, page, per_page });
}
