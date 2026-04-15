import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { UserRole } from "@/generated/prisma/enums";

export const ACTIVE_BRAND_COOKIE = "active_brand_id";

// Special cookie value meaning "show all accessible brands"
export const ALL_BRANDS_VALUE = "all";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandInfo {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  domain: string | null;
  active: boolean;
  settings_json: unknown;
}

/**
 * Returned by getActiveBrand() for every authenticated request.
 *
 * mode = "single": user has selected a specific brand.
 *   - brand is populated
 *   - brandIds contains exactly one entry
 *   - role is the user's brand-specific role from UserBrandPermission
 *     (admin always gets "admin")
 *
 * mode = "all": user is in All Brands view (default after login).
 *   - brand is null
 *   - brandIds contains all accessible active brand IDs
 *   - role is the user's global role from the User table
 *
 * brandIds is always populated and safe to use in { in: ctx.brandIds } filters.
 * An empty array means the user has no accessible brands — queries return nothing.
 */
export interface ActiveBrandContext {
  mode: "single" | "all";
  brand: BrandInfo | null;
  brandIds: string[];
  role: UserRole;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns all active brand IDs accessible to this user.
 * Admin → all active brands.
 * Others → brands they have a UserBrandPermission record for (brand must be active).
 */
async function getAccessibleBrandIds(
  userId: string,
  userGlobalRole: UserRole
): Promise<string[]> {
  if (userGlobalRole === "admin") {
    const brands = await db.brand.findMany({
      where: { active: true },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    return brands.map((b) => b.id);
  }

  const perms = await db.userBrandPermission.findMany({
    where: {
      user_id: userId,
      brand: { active: true },
    },
    select: { brand_id: true },
  });
  return perms.map((p) => p.brand_id);
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Resolves the active brand context for the current request.
 *
 * Always returns a valid ActiveBrandContext — never null.
 *
 * Fallback to all-brands mode when:
 * - cookie is missing
 * - cookie value is "all"
 * - cookie contains a brand_id the user cannot access or that is inactive
 *
 * Route handlers should check ctx.mode before writes:
 *   if (ctx.mode !== "single") return Errors.REQUIRES_SINGLE_BRAND();
 */
export async function getActiveBrand(
  userId: string,
  userGlobalRole: UserRole
): Promise<ActiveBrandContext> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value;

  const accessibleIds = await getAccessibleBrandIds(userId, userGlobalRole);

  // All-brands mode: missing cookie, explicit "all", or zero accessible brands
  if (!cookieValue || cookieValue === ALL_BRANDS_VALUE) {
    return {
      mode: "all",
      brand: null,
      brandIds: accessibleIds,
      role: userGlobalRole,
    };
  }

  // Specific brand requested — validate it is accessible
  const isAccessible = accessibleIds.includes(cookieValue);
  if (!isAccessible) {
    // Invalid or inaccessible brand — fall back to all-brands
    return {
      mode: "all",
      brand: null,
      brandIds: accessibleIds,
      role: userGlobalRole,
    };
  }

  const brand = await db.brand.findFirst({
    where: { id: cookieValue, active: true },
    select: {
      id: true,
      name: true,
      logo_url: true,
      primary_color: true,
      domain: true,
      active: true,
      settings_json: true,
    },
  });

  if (!brand) {
    // Brand no longer exists or inactive — fall back
    return {
      mode: "all",
      brand: null,
      brandIds: accessibleIds,
      role: userGlobalRole,
    };
  }

  // Determine brand-specific role
  let brandRole: UserRole = userGlobalRole;
  if (userGlobalRole !== "admin") {
    const perm = await db.userBrandPermission.findFirst({
      where: { user_id: userId, brand_id: cookieValue },
    });
    if (perm) brandRole = perm.role;
  }

  return {
    mode: "single",
    brand,
    brandIds: [cookieValue],
    role: brandRole,
  };
}
