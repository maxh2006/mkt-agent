import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser, assertCanApprove } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import {
  listTemplatesQuerySchema,
  createTemplateSchema,
  TEMPLATE_TYPES,
  type TemplateType,
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
 * GET /api/templates
 * Returns templates for the active brand plus optional global templates.
 * All roles can read.
 *
 * ?template_type=caption|banner|prompt|cta|asset
 * ?active=true|false
 * ?include_global=true (default) | false
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();

  const parsed = listTemplatesQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Invalid query");
  }

  const { template_type, active, include_global } = parsed.data;

  const brandFilter: Prisma.TemplateWhereInput = include_global
    ? { OR: [{ brand_id: ctx.brand.id }, { brand_id: null }] }
    : { brand_id: ctx.brand.id };

  const where: Prisma.TemplateWhereInput = {
    ...brandFilter,
    ...(template_type ? { template_type } : {}),
    ...(active !== undefined ? { active } : {}),
  };

  const templates = await db.template.findMany({
    where,
    orderBy: [{ template_type: "asc" }, { name: "asc" }],
    select: TEMPLATE_SELECT,
  });

  return ok(templates);
}

/**
 * POST /api/templates
 * Creates a template for the active brand.
 * Requires brand_manager or admin.
 *
 * Body: { template_type, name, active?, config: { content|url, asset_type?, notes? } }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();
  if (!assertCanApprove(ctx)) return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { template_type, name, active, config } = parsed.data;

  // Validate template_type is one of the known values (zod already does, but be explicit)
  if (!(TEMPLATE_TYPES as readonly string[]).includes(template_type)) {
    return Errors.VALIDATION("Invalid template_type");
  }

  const template = await db.template.create({
    data: {
      brand_id: ctx.brand.id,
      template_type: template_type as TemplateType,
      name,
      active: active ?? true,
      config_json: config as Prisma.InputJsonValue,
    },
    select: TEMPLATE_SELECT,
  });

  void writeAuditLog({
    brand_id: ctx.brand.id,
    user_id: user.id,
    action: AuditAction.TEMPLATE_CREATED,
    entity_type: "template",
    entity_id: template.id,
    after: { template_type, name, active: template.active, config },
  });

  return ok(template, 201);
}
