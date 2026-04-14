import { NextResponse } from "next/server";
import type { ActiveBrandContext } from "@/lib/active-brand";
import type { UserRole } from "@/generated/prisma/enums";

// ─── Standard JSON responses ──────────────────────────────────────────────────

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export const Errors = {
  UNAUTHORIZED: () => apiError("Unauthorized", 401),
  FORBIDDEN: () => apiError("Forbidden", 403),
  NO_ACTIVE_BRAND: () => apiError("No active brand selected or access denied", 403),
  NOT_FOUND: (entity = "Resource") => apiError(`${entity} not found`, 404),
  INVALID_TRANSITION: (from: string, to: string) =>
    apiError(`Cannot transition post from "${from}" to "${to}"`, 422),
  VALIDATION: (msg: string) => apiError(msg, 422),
  INTERNAL: () => apiError("Internal server error", 500),
} as const;

// ─── Route handler guard ──────────────────────────────────────────────────────

/**
 * Extracts userId and role from a NextAuth session.
 * Returns null if the session is missing or malformed.
 */
export interface SessionUser {
  id: string;
  role: UserRole;
  name: string | null | undefined;
  email: string | null | undefined;
}

export function sessionUser(session: {
  user?: { id?: string; role?: string; name?: string | null; email?: string | null } | null;
} | null): SessionUser | null {
  const u = session?.user;
  if (!u?.id || !u?.role) return null;
  return {
    id: u.id,
    role: u.role as UserRole,
    name: u.name,
    email: u.email,
  };
}

// ─── Permission guard shorthand ───────────────────────────────────────────────

/**
 * Returns true if the given brand context role can perform write operations.
 * Centralises the check so route handlers stay concise.
 */
export function assertCanEdit(ctx: ActiveBrandContext): boolean {
  return ctx.role !== "viewer";
}

export function assertCanApprove(ctx: ActiveBrandContext): boolean {
  return ctx.role === "admin" || ctx.role === "brand_manager";
}
