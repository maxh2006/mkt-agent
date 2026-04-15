import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import {
  updateTemplateSchema,
  textTemplateConfigSchema,
  assetConfigSchema,
} from "@/lib/validations/template";
import type { Prisma } from "@/generated/prisma/client";

const TEMPLATE_SELECT = {
  id: true,
  brand_id: true,
  template_type: true,
  name: true,
  active: true,
  config_json: true,
  created_at: true,
  updated_at: true,
} as const;

/**
 * GET /api/templates/[id]
 * Returns a single template. The template must belong to the active brand or be global.
 * All roles can read.
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

  const template = await db.template.findFirst({
    where: {
      id,
      OR: [{ brand_id: { in: ctx.brandIds } }, { brand_id: null }],
    },
    select: TEMPLATE_SELECT,
  });
  if (!template) return Errors.NOT_FOUND("Template");

  return ok(template);
}

/**
 * PATCH /api/templates/[id]
 * Updates a template. Only the owning brand's manager/admin can edit.
 * Global templates (brand_id = null) cannot be edited via this route.
 *
 * Body: { name?, active?, config? }
 * config is validated against the template's existing template_type.
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
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const { id } = await params;

  const existing = await db.template.findFirst({
    where: { id, brand_id: ctx.brand!.id }, // global templates are read-only
  });
  if (!existing) return Errors.NOT_FOUND("Template");

  const body = await req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { name, active, config } = parsed.data;

  if (!name && active === undefined && !config) {
    return Errors.VALIDATION("No fields to update");
  }

  // Validate config against the existing template_type
  if (config !== undefined) {
    const configSchema =
      existing.template_type === "asset" ? assetConfigSchema : textTemplateConfigSchema;
    const configParsed = configSchema.safeParse(config);
    if (!configParsed.success) {
      return Errors.VALIDATION(
        configParsed.error.issues[0]?.message ?? "Invalid config"
      );
    }
  }

  const existingConfig = (existing.config_json ?? {}) as Record<string, unknown>;
  const nextConfig: Prisma.InputJsonValue =
    config !== undefined
      ? ({ ...existingConfig, ...config } as Prisma.InputJsonValue)
      : (existingConfig as Prisma.InputJsonValue);

  const updated = await db.template.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(active !== undefined ? { active } : {}),
      config_json: nextConfig,
    },
    select: TEMPLATE_SELECT,
  });

  // Fire the appropriate audit action
  const activeChanged = active !== undefined && active !== existing.active;

  if (activeChanged) {
    void writeAuditLog({
      brand_id: ctx.brand!.id,
      user_id: user.id,
      action: AuditAction.TEMPLATE_TOGGLED,
      entity_type: "template",
      entity_id: id,
      before: { active: existing.active },
      after: { active: updated.active },
    });
  }

  if (name !== undefined || config !== undefined) {
    void writeAuditLog({
      brand_id: ctx.brand!.id,
      user_id: user.id,
      action: AuditAction.TEMPLATE_UPDATED,
      entity_type: "template",
      entity_id: id,
      before: { name: existing.name, config_json: existing.config_json },
      after: { name: updated.name, config_json: updated.config_json },
    });
  }

  return ok(updated);
}
