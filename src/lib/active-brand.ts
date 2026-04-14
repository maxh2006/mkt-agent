import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { UserRole } from "@/generated/prisma/enums";

export const ACTIVE_BRAND_COOKIE = "active_brand_id";

export interface ActiveBrandContext {
  brand: {
    id: string;
    name: string;
    logo_url: string | null;
    primary_color: string | null;
    domain: string | null;
    active: boolean;
    settings_json: unknown;
  };
  role: UserRole;
}

/**
 * Reads the active brand from the cookie, validates it exists and is active,
 * and verifies the current user has access to it.
 *
 * Admin users bypass the permission table and can access any active brand.
 *
 * Returns null when:
 * - the cookie is missing
 * - the brand does not exist or is inactive
 * - the user does not have a permission record for that brand (non-admin)
 */
export async function getActiveBrand(
  userId: string,
  userGlobalRole: UserRole
): Promise<ActiveBrandContext | null> {
  const cookieStore = await cookies();
  const brandId = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value;

  if (!brandId) return null;

  const brand = await db.brand.findFirst({
    where: { id: brandId, active: true },
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

  if (!brand) return null;

  // Admins access any active brand regardless of permission records
  if (userGlobalRole === "admin") {
    return { brand, role: "admin" };
  }

  const permission = await db.userBrandPermission.findFirst({
    where: { user_id: userId, brand_id: brandId },
  });

  if (!permission) return null;

  return { brand, role: permission.role };
}
