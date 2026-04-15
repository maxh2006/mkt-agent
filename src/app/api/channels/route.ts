import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { createChannelSchema } from "@/lib/validations/channel";

/**
 * GET /api/channels
 * Returns all channels for the active brand, ordered by platform then account_name.
 * All roles can read.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);

  const channels = await db.channel.findMany({
    where: { brand_id: { in: ctx.brandIds } },
    orderBy: [{ platform: "asc" }, { account_name: "asc" }],
    include: {
      brand: { select: { id: true, name: true } },
    },
  });

  return ok({ channels, mode: ctx.mode });
}

/**
 * POST /api/channels
 * Creates a new channel for the active brand.
 * Requires brand_manager or admin role.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = createChannelSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { notes, ...rest } = parsed.data;

  const channel = await db.channel.create({
    data: {
      brand_id: ctx.brand!.id,
      platform: rest.platform,
      account_name: rest.account_name,
      status: rest.status ?? "disconnected",
      config_json: notes ? { notes } : {},
    },
  });

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.CHANNEL_CREATED,
    entity_type: "channel",
    entity_id: channel.id,
    after: {
      platform: channel.platform,
      account_name: channel.account_name,
      status: channel.status,
    },
  });

  return ok(channel, 201);
}
