import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { ok, Errors } from "@/lib/api";
import { runManusDispatcher } from "@/lib/manus/dispatcher";

/**
 * POST /api/jobs/dispatch
 *
 * Triggers one pass of the Manus dispatcher. Designed to be called by GCP
 * Cloud Scheduler in production (see docs/08-deployment.md for the runbook).
 * Also callable from `curl` for manual verification. NOT meant for end users.
 *
 * Authentication: shared secret in header `x-dispatch-secret` matching
 * env var MANUS_DISPATCH_SECRET.
 *   - 503 if the secret is not configured (fail-closed; Cloud Scheduler
 *     retries 5xx automatically, so the job heals once the secret is set)
 *   - 401 if the header is missing or wrong
 *
 * Secret comparison is constant-time to avoid leaking byte-by-byte timing.
 */
export async function POST(req: NextRequest) {
  const configured = process.env.MANUS_DISPATCH_SECRET;
  if (!configured) {
    return NextResponse.json(
      { error: "MANUS_DISPATCH_SECRET is not configured on the server" },
      { status: 503 },
    );
  }

  const header = req.headers.get("x-dispatch-secret");
  if (!header || !secretsMatch(header, configured)) {
    return Errors.UNAUTHORIZED();
  }

  const summary = await runManusDispatcher();
  return ok(summary);
}

function secretsMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
