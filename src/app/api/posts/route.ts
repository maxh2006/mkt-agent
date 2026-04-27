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
import { parsePostingInstance, formatPostingInstanceCompact } from "@/lib/posting-instance";

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

  const { status, statuses, platform, post_type, date_from, date_to, sample_group_id, page, per_page } = queryParsed.data;

  const brandFilter = { brand_id: { in: ctx.brandIds } };

  // Sample-group filter — used by the comparison page to fetch all
  // siblings of a given sample_group_id. The id lives inside
  // generation_context_json (Prisma JSONB path filter).
  const sampleGroupFilter = sample_group_id
    ? {
        generation_context_json: {
          path: ["sample_group_id"],
          equals: sample_group_id,
        },
      }
    : {};

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
        if (s === "posted") orClauses.push({ status: "posted", OR: [{ posted_at: range }, { posted_at: null, updated_at: range }] });
        else if (s === "scheduled") orClauses.push({ status: "scheduled", scheduled_at: range });
        else if (s === "approved") orClauses.push({ status: "approved", OR: [{ posted_at: range }, { posted_at: null, updated_at: range }] }); // legacy fallback
        else orClauses.push({ status: s, created_at: range });
      }
      dateFilter = { OR: orClauses };
      statusFilter = {};
    } else {
      dateFilter = { created_at: range };
    }
  }

  const where = { ...brandFilter, ...statusFilter, ...dateFilter, ...sampleGroupFilter, ...(platform && { platform }), ...(post_type && { post_type }) };

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

  // Enrich event-sourced posts with recurrence summary, title, and event window
  const eventIds = [...new Set(posts.filter((p) => p.source_type === "event" && p.source_id).map((p) => p.source_id!))];
  type EventMeta = { title: string; posting_instance_json: unknown; start_at: Date | null; end_at: Date | null };
  const eventMap = new Map<string, EventMeta>();
  if (eventIds.length > 0) {
    const events = await db.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, title: true, posting_instance_json: true, start_at: true, end_at: true },
    });
    for (const e of events) {
      eventMap.set(e.id, { title: e.title, posting_instance_json: e.posting_instance_json, start_at: e.start_at, end_at: e.end_at });
    }
  }

  function fmtShort(d: Date): string {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const enriched = posts.map((p) => {
    const ev = p.source_type === "event" && p.source_id ? eventMap.get(p.source_id) : null;
    const piConfig = ev ? parsePostingInstance(ev.posting_instance_json) : null;
    const eventPostingSummary = piConfig ? formatPostingInstanceCompact(piConfig) : null;

    // Compute schedule_summary (window + cadence)
    let schedule_summary: string | null = null;
    if (ev) {
      if (piConfig && ev.start_at && ev.end_at) {
        schedule_summary = `${fmtShort(ev.start_at)} – ${fmtShort(ev.end_at)} • ${eventPostingSummary}`;
      } else if (ev.start_at && ev.end_at) {
        schedule_summary = `${fmtShort(ev.start_at)} – ${fmtShort(ev.end_at)} • Generate Now • One-time`;
      } else if (!piConfig) {
        schedule_summary = "Generate Now • One-time";
      } else {
        schedule_summary = eventPostingSummary;
      }
    } else if (p.post_type === "big_win") {
      schedule_summary = "Always-on • Big Win automation";
    } else if (p.post_type === "hot_games") {
      schedule_summary = "Always-on • Hot Games scan";
    }

    // Extract sample_group info from generation_context_json if present
    const ctx = (p.generation_context_json ?? null) as Record<string, unknown> | null;
    let sample_group: { id: string; index: number; total: number } | null = null;
    if (ctx && typeof ctx.sample_group_id === "string" && typeof ctx.sample_index === "number" && typeof ctx.sample_total === "number") {
      sample_group = {
        id: ctx.sample_group_id,
        index: ctx.sample_index,
        total: ctx.sample_total,
      };
    }

    return {
      ...p,
      event_posting_summary: eventPostingSummary,
      event_title: ev?.title ?? null,
      schedule_summary,
      sample_group,
    };
  });

  return ok({ posts: enriched, total, page, per_page, mode: ctx.mode });
}
