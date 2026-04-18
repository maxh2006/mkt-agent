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

  const { status, statuses, platform, post_type, date_from, date_to, page, per_page } = queryParsed.data;

  const brandFilter = { brand_id: { in: ctx.brandIds } };

  // Multi-status support: "statuses" (comma-separated) overrides single "status"
  let statusFilter: Record<string, unknown> = {};
  if (statuses) {
    const list = statuses.split(",").map((s) => s.trim()).filter(Boolean);
    statusFilter = list.length === 1 ? { status: list[0] } : { status: { in: list } };
  } else if (status) {
    statusFilter = { status };
  }

  // Date range: map each status to its relevant date field
  let dateFilter: Record<string, unknown> = {};
  if (date_from || date_to) {
    const gte = date_from ? new Date(date_from) : undefined;
    const lte = date_to ? new Date(date_to) : undefined;
    const range = { ...(gte && { gte }), ...(lte && { lte }) };
    const activeStatuses = statuses
      ? statuses.split(",").map((s) => s.trim())
      : status
        ? [status]
        : [];
    if (activeStatuses.length > 0) {
      const orClauses: Record<string, unknown>[] = [];
      for (const s of activeStatuses) {
        if (s === "approved") orClauses.push({ status: "approved", OR: [{ posted_at: range }, { posted_at: null, updated_at: range }] });
        else if (s === "scheduled") orClauses.push({ status: "scheduled", scheduled_at: range });
        else orClauses.push({ status: s, created_at: range });
      }
      dateFilter = { OR: orClauses };
      statusFilter = {};
    } else {
      dateFilter = { created_at: range };
    }
  }

  const where = { ...brandFilter, ...statusFilter, ...dateFilter, ...(platform && { platform }), ...(post_type && { post_type }) };

  const [posts, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * per_page,
      take: per_page,
      include: {
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true, primary_color: true } },
      },
    }),
    db.post.count({ where }),
  ]);

  return ok({ posts, total, page, per_page, mode: ctx.mode });
}
