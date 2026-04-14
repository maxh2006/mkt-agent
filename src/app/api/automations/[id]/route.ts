import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { updateAutomationSchema } from "@/lib/validations/automation";

/**
 * PATCH /api/automations/[id]
 * Updates an automation rule's enabled flag and/or config_json.
 * Requires brand_manager or admin role.
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
  const existing = await db.automationRule.findFirst({
    where: { id, brand_id: ctx.brand.id },
  });
  if (!existing) return Errors.NOT_FOUND("Automation rule");

  const body = await req.json().catch(() => null);
  const parsed = updateAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { enabled, config_json } = parsed.data;

  // Full replace — not a shallow merge.
  // A shallow merge would silently drop nested keys that were omitted from the incoming payload
  // (e.g., value_display sub-fields). The UI always sends the full config object, and callers
  // are required to do the same. This prevents stale nested values from persisting.
  const nextConfig: Prisma.InputJsonValue =
    config_json !== undefined
      ? (config_json as Prisma.InputJsonValue)
      : (existing.config_json as Prisma.InputJsonValue);

  const updated = await db.automationRule.update({
    where: { id },
    data: {
      ...(enabled !== undefined ? { enabled } : {}),
      config_json: nextConfig,
    },
  });

  // Determine whether value_display settings changed (big_win only)
  const existingCfg = existing.config_json as Record<string, unknown>;
  const newCfg = config_json as Record<string, unknown> | undefined;
  const valueDisplayChanged =
    newCfg !== undefined &&
    JSON.stringify(existingCfg.value_display) !== JSON.stringify(newCfg.value_display);

  if (valueDisplayChanged) {
    void writeAuditLog({
      brand_id: ctx.brand.id,
      user_id: user.id,
      action: AuditAction.AUTOMATION_VALUE_DISPLAY_CHANGED,
      entity_type: "automation_rule",
      entity_id: id,
      before: { value_display: existingCfg.value_display },
      after: { value_display: newCfg?.value_display },
    });
  }

  void writeAuditLog({
    brand_id: ctx.brand.id,
    user_id: user.id,
    action: AuditAction.AUTOMATION_UPDATED,
    entity_type: "automation_rule",
    entity_id: id,
    before: { enabled: existing.enabled, config_json: existing.config_json },
    after: { enabled: updated.enabled, config_json: updated.config_json },
  });

  return ok(updated);
}
