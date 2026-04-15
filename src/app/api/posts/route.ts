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
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanEdit(ctx)) return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const post = await db.post.create({
    data: {
      brand_id: ctx.brand!.id,
      created_by: user.id,
      status: "draft",
      tracking_id: crypto.randomUUID(),
      ...parsed.data,
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.POST_CREATED,
    entity_type: "post",
    entity_id: post.id,
    after: { status: post.status, post_type: post.post_type, platform: post.platform },
  });

  return ok(post, 201);
}

// ─── GET /api/posts — list posts (brand-scoped, supports all-brands mode) ─────

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);

  const { searchParams } = new URL(req.url);
  const queryParsed = listPostsQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!queryParsed.success) {
    return Errors.VALIDATION(queryParsed.error.issues[0]?.message ?? "Invalid query");
  }

  const { status, platform, post_type, page, per_page } = queryParsed.data;

  const brandFilter = { brand_id: { in: ctx.brandIds } };

  const [posts, total] = await Promise.all([
    db.post.findMany({
      where: {
        ...brandFilter,
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
        brand: { select: { id: true, name: true } },
      },
    }),
    db.post.count({
      where: {
        ...brandFilter,
        ...(status && { status }),
        ...(platform && { platform }),
        ...(post_type && { post_type }),
      },
    }),
  ]);

  return ok({ posts, total, page, per_page, mode: ctx.mode });
}
