import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanEdit } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { updateEventSchema } from "@/lib/validations/event";

/**
 * GET /api/events/[id]
 * Returns a single brand-scoped event. All roles can read.
 * Works in both single and all-brands mode.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);

  const { id } = await params;
  const event = await db.event.findFirst({
    where: { id, brand_id: { in: ctx.brandIds } },
    include: {
      creator: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
    },
  });
  if (!event) return Errors.NOT_FOUND("Event");

  return ok(event);
}

/**
 * PATCH /api/events/[id]
 * Updates an event. Requires single-brand mode + operator role or above.
 */
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
  const existing = await db.event.findFirst({
    where: { id, brand_id: ctx.brand!.id },
  });
  if (!existing) return Errors.NOT_FOUND("Event");

  const body = await req.json().catch(() => null);
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { start_at, end_at, ...rest } = parsed.data;

  const updated = await db.event.update({
    where: { id },
    data: {
      ...rest,
      ...(start_at !== undefined ? { start_at: new Date(start_at) } : {}),
      ...(end_at !== undefined ? { end_at: new Date(end_at) } : {}),
    },
    include: {
      creator: { select: { id: true, name: true } },
    },
  });

  const statusChanged = rest.status !== undefined && rest.status !== existing.status;
  const nonStatusFieldsChanged = Object.keys(parsed.data).some((k) => k !== "status");

  if (nonStatusFieldsChanged) {
    void writeAuditLog({
      brand_id: ctx.brand!.id,
      user_id: user.id,
      action: AuditAction.EVENT_UPDATED,
      entity_type: "event",
      entity_id: id,
      before: {
        title: existing.title,
        event_type: existing.event_type,
        objective: existing.objective,
        rules: existing.rules,
        reward: existing.reward,
        theme: existing.theme,
        start_at: existing.start_at,
        end_at: existing.end_at,
      },
      after: {
        title: updated.title,
        event_type: updated.event_type,
        objective: updated.objective,
        rules: updated.rules,
        reward: updated.reward,
        theme: updated.theme,
        start_at: updated.start_at,
        end_at: updated.end_at,
      },
    });
  }

  if (statusChanged) {
    void writeAuditLog({
      brand_id: ctx.brand!.id,
      user_id: user.id,
      action: AuditAction.EVENT_STATUS_CHANGED,
      entity_type: "event",
      entity_id: id,
      before: { status: existing.status },
      after: { status: updated.status },
    });
  }

  return ok(updated);
}
