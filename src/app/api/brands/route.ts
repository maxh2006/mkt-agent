import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ok, Errors, sessionUser } from "@/lib/api";
import { writeAuditLog, AuditAction } from "@/lib/audit";
import {
  createBrandSchema,
  listBrandsQuerySchema,
} from "@/lib/validations/brand";

// ─── Shared select shape ──────────────────────────────────────────────────────

const BRAND_LIST_SELECT = {
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
 * GET /api/brands
 * Admin: returns all brands.
 * Other roles: returns only brands the user has permission for.
 * Used by the brand switcher in the topbar for all roles.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const { searchParams } = new URL(req.url);
  const parsed = listBrandsQuerySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    active: searchParams.get("active") ?? undefined,
  });
  if (!parsed.success) return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");

  const { search, active } = parsed.data;

  const activeFilter =
    active === "true" ? true : active === "false" ? false : undefined;

  if (user.role === "admin") {
    const brands = await db.brand.findMany({
      where: {
        ...(activeFilter !== undefined ? { active: activeFilter } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      select: BRAND_LIST_SELECT,
      orderBy: { name: "asc" },
    });
    return ok(brands);
  }

  // Non-admin: return only brands the user has a permission record for
  const permissions = await db.userBrandPermission.findMany({
    where: { user_id: user.id },
    select: { brand_id: true },
  });
  const brandIds = permissions.map((p) => p.brand_id);

  const brands = await db.brand.findMany({
    where: {
      id: { in: brandIds },
      active: true, // non-admins only see active brands
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    select: BRAND_LIST_SELECT,
    orderBy: { name: "asc" },
  });
  return ok(brands);
}

/**
 * POST /api/brands
 * Admin only — creates a new brand.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();
  if (user.role !== "admin") return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = createBrandSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Validation error");
  }

  const { identity, integration, voice, design, sample_captions } = parsed.data;

  const brand = await db.brand.create({
    data: {
      name: identity.name,
      domain: identity.domain,
      // logo_url (top-level column) is legacy; logos now live in
      // design_settings_json.logos. Left null on create.
      logo_url: null,
      primary_color: identity.primary_color,
      secondary_color: identity.secondary_color,
      accent_color: identity.accent_color,
      active: identity.active ?? true,
      integration_settings_json: integration ?? {},
      voice_settings_json: voice ?? {},
      design_settings_json: design ?? {},
      sample_captions_json: sample_captions ?? [],
    },
    select: BRAND_LIST_SELECT,
  });

  void writeAuditLog({
    brand_id: brand.id,
    user_id: user.id,
    action: AuditAction.BRAND_CREATED,
    entity_type: "brand",
    entity_id: brand.id,
    after: { name: brand.name, active: brand.active },
  });

  return ok(brand, 201);
}
