import type { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * Look up what role a user has for a specific brand.
 * Admins have access to all brands regardless of permission records.
 * Returns null if no access.
 */
export async function getUserBrandRole(
  userId: string,
  brandId: string,
  userGlobalRole: UserRole
): Promise<UserRole | null> {
  if (userGlobalRole === "admin") return "admin";

  const permission = await db.userBrandPermission.findFirst({
    where: { user_id: userId, brand_id: brandId },
  });

  return permission?.role ?? null;
}

/**
 * Check if a user can access a brand at all.
 */
export async function canAccessBrand(
  userId: string,
  brandId: string,
  userGlobalRole: UserRole
): Promise<boolean> {
  const role = await getUserBrandRole(userId, brandId, userGlobalRole);
  return role !== null;
}

// ─── Role capability checks (synchronous, takes the resolved role) ────────────

/** Can approve and schedule posts. */
export function canApprove(role: UserRole): boolean {
  return role === "admin" || role === "brand_manager";
}

/** Can create and edit drafts. */
export function canEdit(role: UserRole): boolean {
  return role !== "viewer";
}

/** Can manage brand settings, channels, and automation rules. */
export function canManageSettings(role: UserRole): boolean {
  return role === "admin" || role === "brand_manager";
}

/** Can manage users and global settings. */
export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}
