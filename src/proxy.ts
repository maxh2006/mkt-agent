import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");

  // When behind Cloudflare Tunnel, use the forwarded host so redirects
  // go to the public URL, not localhost.
  function getOrigin() {
    const host = req.headers.get("x-forwarded-host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return host ? `${proto}://${host}` : req.nextUrl.origin;
  }

  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", getOrigin()));
  }

  if (isLoggedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/", getOrigin()));
  }
});

export const config = {
  // api/jobs/* and api/manus/* routes use their own secret-based auth
  // (MANUS_DISPATCH_SECRET, MANUS_WEBHOOK_SECRET), so they bypass the session
  // auth middleware here.
  matcher: ["/((?!api/auth|api/jobs|api/manus|_next/static|_next/image|favicon.ico).*)"],
};
