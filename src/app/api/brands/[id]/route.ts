import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ok, Errors, sessionUser } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import { updateBrandSchema } from "@/lib/validations/brand";

const BRAND_FULL_SELECT = {
  id: true,
  name: true,
  logo_url: true,
  primary_color: true,
  secondary_color: true,
  accent_color: true,
  domain: true,
  active: true,
  integration_settings_json: true,
  voice_settings_json: true,
  design_settings_json: true,
  sample_captions_json: true,
  created_at: true,
  updated_at: true,
} as const;

/**
 * GET /api/brands/[id]
 * Admin only — returns full brand record including all settings.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();
  if (user.role !== "admin") return Errors.FORBIDDEN();

  const { id } = await params;

  const brand = await db.brand.findFirst({
    where: { id },
    select: BRAND_FULL_SELECT,
  });
  if (!brand) return Errors.NOT_FOUND("Brand");

  return ok(brand);
}

/**
 * PATCH /api/brands/[id]
 * Admin only — updates any combination of brand sections.
 * Each section replaces its JSON blob entirely (not deep-merged).
 * identity fields are updated as individual columns.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();
  if (user.role !== "admin") return Errors.FORBIDDEN();

  const { id } = await params;

  const existing = await db.brand.findFirst({ where: { id } });
  if (!existing) return Errors.NOT_FOUND("Brand");

  const body = await req.json().catch(() => null);
  const parsed = updateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { identity, integration, voice, design, sample_captions } = parsed.data;

  // Build identity column updates. logo_url (top-level column) is no longer
  // written from the form — logos live in design_settings_json.logos since
  // 2026-04-21. Legacy column reads still work; it just isn't updated here.
  const identityData = identity
    ? {
        ...(identity.name !== undefined ? { name: identity.name } : {}),
        ...(identity.domain !== undefined ? { domain: identity.domain } : {}),
        ...(identity.primary_color !== undefined ? { primary_color: identity.primary_color } : {}),
        ...(identity.secondary_color !== undefined ? { secondary_color: identity.secondary_color } : {}),
        ...(identity.accent_color !== undefined ? { accent_color: identity.accent_color } : {}),
        ...(identity.active !== undefined ? { active: identity.active } : {}),
      }
    : {};

  const updated = await db.brand.update({
    where: { id },
    data: {
      ...identityData,
      ...(integration !== undefined
        ? { integration_settings_json: integration as Prisma.InputJsonValue }
        : {}),
      ...(voice !== undefined
        ? { voice_settings_json: voice as Prisma.InputJsonValue }
        : {}),
      ...(design !== undefined
        ? { design_settings_json: design as Prisma.InputJsonValue }
        : {}),
      ...(sample_captions !== undefined
        ? { sample_captions_json: sample_captions as Prisma.InputJsonValue }
        : {}),
    },
    select: BRAND_FULL_SELECT,
  });

  // Determine which audit actions to fire
  const activeChanged = identity?.active !== undefined && identity.active !== existing.active;
  const integrationChanged = integration !== undefined;

  if (activeChanged) {
    void writeAuditLog({
      brand_id: id,
      user_id: user.id,
      action: updated.active ? AuditAction.BRAND_ACTIVATED : AuditAction.BRAND_DEACTIVATED,
      entity_type: "brand",
      entity_id: id,
      before: { active: existing.active },
      after: { active: updated.active },
    });
  }

  if (integrationChanged) {
    void writeAuditLog({
      brand_id: id,
      user_id: user.id,
      action: AuditAction.BRAND_INTEGRATION_CHANGED,
      entity_type: "brand",
      entity_id: id,
      before: { integration_settings_json: existing.integration_settings_json },
      after: { integration_settings_json: updated.integration_settings_json },
    });
  }

  void writeAuditLog({
    brand_id: id,
    user_id: user.id,
    action: AuditAction.BRAND_UPDATED,
    entity_type: "brand",
    entity_id: id,
    before: {
      name: existing.name,
      domain: existing.domain,
      active: existing.active,
    },
    after: {
      name: updated.name,
      domain: updated.domain,
      active: updated.active,
    },
  });

  return ok(updated);
}
