// Resolves the user id automation flows attribute drafts to.
//
// ⚠️ TEMPORARY MVP SHORTCUT (locked 2026-04-27):
//   Returns the first admin user found, ordered by `created_at ASC`.
//   This is NOT a long-term answer — automation-generated drafts
//   should be attributed to a real "system" / "service" user that
//   exists for this purpose only. Introducing that user is a
//   one-time data migration; until it lands, the helper's internals
//   pick the deterministic first-admin so:
//     - audit logs aren't muddied (one stable id, not whichever
//       admin happened to be in session)
//     - queue UI can still resolve `created_by` to a name
//     - swapping to a real system user later is a single-file
//       internals change with no caller impact
//
// Cached at module scope after first lookup so repeated automation
// runs don't re-hit the DB.

import { db } from "@/lib/db";

let cached: { id: string; name: string } | null = null;

export async function getAutomationCreator(): Promise<{ id: string; name: string }> {
  if (cached) return cached;

  const admin = await db.user.findFirst({
    where: { role: "admin", active: true },
    orderBy: { created_at: "asc" },
    select: { id: true, name: true },
  });

  if (!admin) {
    throw new Error(
      "No active admin user found to attribute automation-generated drafts to. " +
        "Create at least one admin (or, when the system-user migration lands, ensure that user exists).",
    );
  }

  cached = admin;
  return cached;
}

/**
 * Test seam — clears the module-level cache. Not used in prod paths;
 * exported so unit / smoke tests can re-trigger the lookup with a
 * fresh DB state. Safe to call any time.
 */
export function _resetAutomationCreatorCache(): void {
  cached = null;
}
