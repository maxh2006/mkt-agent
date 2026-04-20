import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanEdit } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { createEventSchema, listEventsQuerySchema } from "@/lib/validations/event";
import { normalizeEvents } from "@/lib/event-status";
import { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = listEventsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { status, event_type, search, page, per_page } = parsed.data;

  const where = {
    brand_id: { in: ctx.brandIds },
    ...(status ? { status } : {}),
    ...(event_type ? { event_type } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { objective: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [events, total] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * per_page,
      take: per_page,
      include: {
        creator: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    }),
    db.event.count({ where }),
  ]);

  return ok({ events: normalizeEvents(events), total, page, per_page, mode: ctx.mode });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanEdit(ctx)) return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { start_at, end_at, posting_instance_json, ...rest } = parsed.data;

  const event = await db.event.create({
    data: {
      ...rest,
      brand_id: ctx.brand!.id,
      created_by: user.id,
      status: "active",
      start_at: start_at ? new Date(start_at) : undefined,
      end_at: end_at ? new Date(end_at) : undefined,
      ...(posting_instance_json !== undefined
        ? { posting_instance_json: posting_instance_json === null ? Prisma.JsonNull : posting_instance_json }
        : {}),
    },
    include: {
      creator: { select: { id: true, name: true } },
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.EVENT_CREATED,
    entity_type: "event",
    entity_id: event.id,
    after: {
      title: event.title,
      event_type: event.event_type,
      status: event.status,
      auto_generate_posts: event.auto_generate_posts,
    },
  });

  return ok(event, 201);
}
