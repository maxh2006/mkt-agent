import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ACTIVE_BRAND_COOKIE, ALL_BRANDS_VALUE } from "@/lib/active-brand";
import { Errors, sessionUser } from "@/lib/api";

/**
 * GET /api/brands/active
 * Returns current active brand context for the topbar/client.
 *
 * Response shape:
 *   { data: { mode: "single", brand: { id, name, primary_color } } }
 *   { data: { mode: "all",    brand: null } }
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const cookieValue = req.cookies.get(ACTIVE_BRAND_COOKIE)?.value;

  // All-brands mode: missing cookie or explicit "all"
  if (!cookieValue || cookieValue === ALL_BRANDS_VALUE) {
    return NextResponse.json({ data: { mode: "all", brand: null } });
  }

  // Specific brand — validate accessible + active
  const brand = await db.brand.findFirst({
    where: { id: cookieValue, active: true },
    select: { id: true, name: true, primary_color: true },
  });

  if (!brand) {
    // Invalid/inactive brand in cookie — treat as all-brands
    return NextResponse.json({ data: { mode: "all", brand: null } });
  }

  // Non-admins must have a permission record
  if (user.role !== "admin") {
    const perm = await db.userBrandPermission.findFirst({
      where: { user_id: user.id, brand_id: cookieValue },
    });
    if (!perm) {
      return NextResponse.json({ data: { mode: "all", brand: null } });
    }
  }

  return NextResponse.json({ data: { mode: "single", brand } });
}

/**
 * POST /api/brands/active
 * Sets the active brand cookie.
 * brand_id = "all" → all-brands mode (sets cookie to "all").
 * brand_id = <id>  → single brand mode (validates access first).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const body = await req.json().catch(() => null);
  const parsed = z.object({ brand_id: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return Errors.VALIDATION("brand_id is required");

  const { brand_id } = parsed.data;

  // All-brands mode
  if (brand_id === ALL_BRANDS_VALUE) {
    const response = NextResponse.json({ data: { mode: "all", brand: null } });
    response.cookies.set(ACTIVE_BRAND_COOKIE, ALL_BRANDS_VALUE, cookieOptions());
    return response;
  }

  // Validate specific brand exists and is active
  const brand = await db.brand.findFirst({
    where: { id: brand_id, active: true },
    select: { id: true, name: true },
  });
  if (!brand) return Errors.NOT_FOUND("Brand");

  // Non-admins need a permission record
  if (user.role !== "admin") {
    const permission = await db.userBrandPermission.findFirst({
      where: { user_id: user.id, brand_id },
    });
    if (!permission) return Errors.FORBIDDEN();
  }

  const response = NextResponse.json({ data: { mode: "single", brand } });
  response.cookies.set(ACTIVE_BRAND_COOKIE, brand_id, cookieOptions());
  return response;
}

/**
 * DELETE /api/brands/active
 * Clears the active brand cookie (equivalent to all-brands mode).
 */
export async function DELETE() {
  const session = await auth();
  if (!sessionUser(session)) return Errors.UNAUTHORIZED();

  const response = NextResponse.json({ data: null });
  response.cookies.delete(ACTIVE_BRAND_COOKIE);
  return response;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  };
}
