import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { updateAutomationSchema, bigWinRuleConfigSchema, onGoingPromotionRuleConfigSchema, hotGamesRuleConfigSchema } from "@/lib/validations/automation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;
  const existing = await db.automationRule.findFirst({
    where: { id, brand_id: ctx.brand!.id },
  });
  if (!existing) return Errors.NOT_FOUND("Automation rule");

  const body = await req.json().catch(() => null);
  const parsed = updateAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { enabled, config_json } = parsed.data;

  if (config_json) {
    const schemaMap: Record<string, { safeParse: (d: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }> = {
      big_win: bigWinRuleConfigSchema,
      running_promotion: onGoingPromotionRuleConfigSchema,
      hot_games: hotGamesRuleConfigSchema,
    };
    const schema = schemaMap[existing.rule_type];
    if (schema) {
      const result = schema.safeParse(config_json);
      if (!result.success) {
        return Errors.VALIDATION(result.error?.issues[0]?.message ?? "Invalid config");
      }
    }
  }

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

  void writeAuditLog({
    brand_id: ctx.brand!.id,
    user_id: user.id,
    action: AuditAction.AUTOMATION_UPDATED,
    entity_type: "automation_rule",
    entity_id: id,
    before: { enabled: existing.enabled, config_json: existing.config_json },
    after: { enabled: updated.enabled, config_json: updated.config_json },
  });

  return ok(updated);
}
