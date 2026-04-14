import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { updateChannelSchema } from "@/lib/validations/channel";

/**
 * GET /api/channels/[id]
 * Returns a single brand-scoped channel. All roles can read.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();

  const { id } = await params;
  const channel = await db.channel.findFirst({
    where: { id, brand_id: ctx.brand.id },
  });
  if (!channel) return Errors.NOT_FOUND("Channel");

  return ok(channel);
}

/**
 * PATCH /api/channels/[id]
 * Updates a channel's account_name, status, and/or notes.
 * Requires brand_manager or admin role.
 * Status changes are recorded as a separate CHANNEL_STATUS_CHANGED audit entry.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;
  const existing = await db.channel.findFirst({
    where: { id, brand_id: ctx.brand.id },
  });
  if (!existing) return Errors.NOT_FOUND("Channel");

  const body = await req.json().catch(() => null);
  const parsed = updateChannelSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { notes, status, account_name } = parsed.data;

  // Merge notes into config_json (full replace of the notes key only)
  const existingConfig = existing.config_json as Record<string, unknown>;
  const nextConfig: Prisma.InputJsonValue =
    notes !== undefined
      ? ({ ...existingConfig, ...(notes ? { notes } : {}) } as Prisma.InputJsonValue)
      : (existingConfig as Prisma.InputJsonValue);

  const updated = await db.channel.update({
    where: { id },
    data: {
      ...(account_name !== undefined ? { account_name } : {}),
      ...(status !== undefined ? { status } : {}),
      config_json: nextConfig,
    },
  });

  const statusChanged = status !== undefined && status !== existing.status;

  if (statusChanged) {
    void writeAuditLog({
      brand_id: ctx.brand.id,
      user_id: user.id,
      action: AuditAction.CHANNEL_STATUS_CHANGED,
      entity_type: "channel",
      entity_id: id,
      before: { status: existing.status },
      after: { status: updated.status },
    });
  }

  void writeAuditLog({
    brand_id: ctx.brand.id,
    user_id: user.id,
    action: AuditAction.CHANNEL_UPDATED,
    entity_type: "channel",
    entity_id: id,
    before: {
      account_name: existing.account_name,
      status: existing.status,
      config_json: existing.config_json,
    },
    after: {
      account_name: updated.account_name,
      status: updated.status,
      config_json: updated.config_json,
    },
  });

  return ok(updated);
}
