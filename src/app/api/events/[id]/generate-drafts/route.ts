import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanEdit } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { parsePostingInstance, generateOccurrences } from "@/lib/posting-instance";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanEdit(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;
  const event = await db.event.findFirst({
    where: { id, brand_id: ctx.brand!.id },
  });
  if (!event) return Errors.NOT_FOUND("Event");

  const piConfig = parsePostingInstance(event.posting_instance_json);

  // Recurrence mode requires start and end dates; Generate Now mode does not.
  if (piConfig && (!event.start_at || !event.end_at)) {
    return Errors.VALIDATION("Event with a posting schedule must have start and end dates to generate drafts");
  }

  const platforms = Array.isArray(event.platform_scope) && event.platform_scope.length > 0
    ? (event.platform_scope as string[])
    : ["facebook"];

  // If there's a posting schedule → recurrence occurrences; otherwise (Generate Now) → one immediate occurrence.
  const occurrences = piConfig
    ? generateOccurrences(piConfig, event.start_at!, event.end_at!)
    : [new Date()];

  const existingPosts = await db.post.findMany({
    where: { source_type: "event", source_id: event.id },
    select: { source_instance_key: true, platform: true },
  });
  const existingKeys = new Set(
    existingPosts.map((p) => `${p.source_instance_key}__${p.platform}`),
  );

  const toCreate: Array<{
    brand_id: string;
    post_type: "event";
    platform: "instagram" | "facebook" | "twitter" | "tiktok" | "telegram";
    status: "draft";
    source_type: "event";
    source_id: string;
    source_instance_key: string;
    scheduled_at: Date;
    created_by: string;
    tracking_id: string;
  }> = [];

  for (const occ of occurrences) {
    const instanceKey = occ.toISOString();
    for (const plat of platforms) {
      const dedupeKey = `${instanceKey}__${plat}`;
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);
      toCreate.push({
        brand_id: ctx.brand!.id,
        post_type: "event",
        platform: plat as "instagram" | "facebook" | "twitter" | "tiktok" | "telegram",
        status: "draft",
        source_type: "event",
        source_id: event.id,
        source_instance_key: instanceKey,
        scheduled_at: occ,
        created_by: user.id,
        tracking_id: crypto.randomUUID(),
      });
    }
  }

  if (toCreate.length > 0) {
    await db.post.createMany({ data: toCreate });
  }

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.EVENT_DRAFTS_GENERATED,
    entity_type: "event",
    entity_id: event.id,
    after: { drafts_created: toCreate.length, occurrences: occurrences.length, platforms },
  });

  return ok({ created: toCreate.length, occurrences: occurrences.length });
}
