import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ACTIVE_BRAND_COOKIE } from "@/lib/active-brand";
import { Errors, sessionUser } from "@/lib/api";

const bodySchema = z.object({
  brand_id: z.string().min(1),
});

/**
 * POST /api/brands/active
 * Sets the active brand cookie after validating the user has access.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Errors.VALIDATION("brand_id is required");

  const { brand_id } = parsed.data;

  // Validate the brand exists and is active
  const brand = await db.brand.findFirst({
    where: { id: brand_id, active: true },
    select: { id: true, name: true },
  });
  if (!brand) return Errors.NOT_FOUND("Brand");

  // Admins can select any brand; others need a permission record
  if (user.role !== "admin") {
    const permission = await db.userBrandPermission.findFirst({
      where: { user_id: user.id, brand_id },
    });
    if (!permission) return Errors.FORBIDDEN();
  }

  const response = NextResponse.json({ data: { id: brand.id, name: brand.name } });
  response.cookies.set(ACTIVE_BRAND_COOKIE, brand_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return response;
}

/**
 * DELETE /api/brands/active
 * Clears the active brand cookie.
 */
export async function DELETE() {
  const session = await auth();
  if (!sessionUser(session)) return Errors.UNAUTHORIZED();

  const response = NextResponse.json({ data: null });
  response.cookies.delete(ACTIVE_BRAND_COOKIE);
  return response;
}
