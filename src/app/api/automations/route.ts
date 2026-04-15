import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { DEFAULT_AUTOMATION_SEEDS } from "@/lib/validations/automation";

/**
 * GET /api/automations
 * Returns all automation rules for the active brand.
 * Seeds default rules if none exist yet for the brand (idempotent).
 * All roles can read.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);

  // In all-brands mode, skip seeding and return rules across all accessible brands.
  if (ctx.mode === "all") {
    const rules = await db.automationRule.findMany({
      where: { brand_id: { in: ctx.brandIds } },
      orderBy: { created_at: "asc" },
      include: { brand: { select: { id: true, name: true } } },
    });
    return ok({ rules, mode: ctx.mode });
  }

  const brandId = ctx.brand!.id;

  // Upsert each default rule by (brand_id, rule_type).
  // Using upsert-per-rule rather than createMany so this is safe under concurrent requests
  // and idempotent at the DB level via the @@unique([brand_id, rule_type]) constraint.
  // The update clause is a no-op (empty object) — we never overwrite an existing configured rule.
  // Fetch existing rules for this brand.
  const existing = await db.automationRule.findMany({
    where: { brand_id: brandId },
    orderBy: { created_at: "asc" },
  });

  const existingTypes = new Set(existing.map((r) => r.rule_type));
  const toCreate = DEFAULT_AUTOMATION_SEEDS.filter((s) => !existingTypes.has(s.rule_type));

  if (toCreate.length > 0) {
    // skipDuplicates is the DB-level safety net against concurrent requests
    // both finding a partial set and attempting to insert the same rule_type for the brand.
    // The @@unique([brand_id, rule_type]) schema constraint is the authoritative guard.
    const created = await db.automationRule.createManyAndReturn({
      data: toCreate.map((seed) => ({
        brand_id: brandId,
        rule_type: seed.rule_type,
        rule_name: seed.rule_name,
        enabled: false,
        config_json: seed.config as object,
      })),
      skipDuplicates: true,
    });

    for (const rule of created) {
      void writeAuditLog({
        brand_id: brandId,
        user_id: user.id,
        action: AuditAction.AUTOMATION_CREATED,
        entity_type: "automation_rule",
        entity_id: rule.id,
        after: { rule_type: rule.rule_type, rule_name: rule.rule_name, enabled: rule.enabled },
      });
    }

    // Return a fresh full list so the response is always consistent
    const all = await db.automationRule.findMany({
      where: { brand_id: brandId },
      orderBy: { created_at: "asc" },
    });
    return ok({ rules: all, mode: ctx.mode });
  }

  return ok({ rules: existing, mode: ctx.mode });
}
