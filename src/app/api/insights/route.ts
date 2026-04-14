import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser } from "@/lib/api";

// ─── Period helpers (Asia/Manila = UTC+8) ────────────────────────────────────

const VALID_PERIODS = ["today", "last_7_days", "last_30_days"] as const;
type Period = (typeof VALID_PERIODS)[number];

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * Returns { gte, lt } in UTC that corresponds to the requested period in Manila
 * calendar days. All boundaries align to 00:00 Manila (= 16:00 UTC previous day).
 *
 * - today        → [Manila today 00:00, Manila tomorrow 00:00)
 * - last_7_days  → [Manila 7 days ago 00:00, Manila tomorrow 00:00)
 * - last_30_days → [Manila 30 days ago 00:00, Manila tomorrow 00:00)
 */
function periodRange(period: Period): { gte: Date; lt: Date } {
  const nowUtc = Date.now();

  // Shift clock to Manila, then extract the calendar date
  const nowManilaMs = nowUtc + MANILA_OFFSET_MS;
  const manilaDate = new Date(nowManilaMs);
  const y = manilaDate.getUTCFullYear();
  const m = manilaDate.getUTCMonth();
  const d = manilaDate.getUTCDate();

  // Manila midnight (today) expressed in UTC
  const todayManilaInUtc = new Date(Date.UTC(y, m, d) - MANILA_OFFSET_MS);
  // Manila midnight (tomorrow) in UTC
  const tomorrowManilaInUtc = new Date(todayManilaInUtc.getTime() + 86400_000);

  if (period === "today") {
    return { gte: todayManilaInUtc, lt: tomorrowManilaInUtc };
  }

  const daysBack = period === "last_7_days" ? 7 : 30;
  const startManilaInUtc = new Date(todayManilaInUtc.getTime() - (daysBack - 1) * 86400_000);
  return { gte: startManilaInUtc, lt: tomorrowManilaInUtc };
}

// ─── Decimal → string ────────────────────────────────────────────────────────

function decimalStr(v: { toFixed: (n: number) => string } | null | undefined): string {
  return v ? v.toFixed(2) : "0.00";
}

// ─── Top post shape ───────────────────────────────────────────────────────────

interface TopPost {
  post_id: string;
  headline: string | null;
  platform: string;
  post_type: string;
  clicks: number;
  total_deposit: string;
  total_ggr: string;
  rollup_updated_at: string;
}

function toTopPost(r: {
  post_id: string;
  clicks: number;
  total_deposit: { toFixed: (n: number) => string };
  total_ggr: { toFixed: (n: number) => string };
  updated_at: Date;
  post: { headline: string | null; platform: string; post_type: string };
}): TopPost {
  return {
    post_id: r.post_id,
    headline: r.post.headline,
    platform: r.post.platform,
    post_type: r.post.post_type,
    clicks: r.clicks,
    total_deposit: decimalStr(r.total_deposit),
    total_ggr: decimalStr(r.total_ggr),
    rollup_updated_at: r.updated_at.toISOString(),
  };
}

/**
 * GET /api/insights?period=last_7_days&top_limit=5
 * Returns operational + attribution metrics and top content for the active brand.
 * All roles can view.
 *
 * period    : today | last_7_days (default) | last_30_days
 * top_limit : number of top posts per table, 1–20 (default 5)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();

  const params = req.nextUrl.searchParams;

  const rawPeriod = params.get("period") ?? "last_7_days";
  const period: Period = (VALID_PERIODS as readonly string[]).includes(rawPeriod)
    ? (rawPeriod as Period)
    : "last_7_days";

  const rawLimit = parseInt(params.get("top_limit") ?? "5", 10);
  const topLimit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 20 ? rawLimit : 5;

  const brandId = ctx.brand.id;
  const { gte, lt } = periodRange(period);
  const dateFilter = { gte, lt };

  // ── Operational metrics ──────────────────────────────────────────────────
  const [generated, approved, rejected, published] = await Promise.all([
    db.post.count({
      where: { brand_id: brandId, created_at: dateFilter },
    }),
    db.post.count({
      where: {
        brand_id: brandId,
        status: { in: ["approved", "scheduled", "posted"] },
        created_at: dateFilter,
      },
    }),
    db.post.count({
      where: { brand_id: brandId, status: "rejected", created_at: dateFilter },
    }),
    db.post.count({
      where: { brand_id: brandId, status: "posted", created_at: dateFilter },
    }),
  ]);

  // ── Attribution metrics (raw event tables, status=success only for deposits) ─
  const successFilter = { brand_id: brandId, status: "success", created_at: dateFilter };

  const [clicks, signups, depositAgg, ggrAgg, depositorGroups] = await Promise.all([
    db.clickEvent.count({
      where: { brand_id: brandId, created_at: dateFilter },
    }),
    db.signupEvent.count({
      where: { brand_id: brandId, created_at: dateFilter },
    }),
    db.depositEvent.aggregate({
      where: successFilter,
      _sum: { amount: true },
    }),
    db.revenueEvent.aggregate({
      where: successFilter,
      _sum: { ggr_amount: true },
    }),
    // Unique depositing users — count distinct user_id from successful deposits
    db.depositEvent.groupBy({
      by: ["user_id"],
      where: successFilter,
      _count: { user_id: true },
    }),
  ]);

  // ── Top content (all-time cumulative rollup, brand-scoped) ───────────────
  const rollupSelect = {
    post_id: true,
    clicks: true,
    total_deposit: true,
    total_ggr: true,
    updated_at: true,
    post: { select: { headline: true, platform: true, post_type: true } },
  } as const;

  const [topByClicks, topByDeposit, topByGgr] = await Promise.all([
    db.postMetricsRollup.findMany({
      where: { brand_id: brandId },
      orderBy: { clicks: "desc" },
      take: topLimit,
      select: rollupSelect,
    }),
    db.postMetricsRollup.findMany({
      where: { brand_id: brandId },
      orderBy: { total_deposit: "desc" },
      take: topLimit,
      select: rollupSelect,
    }),
    db.postMetricsRollup.findMany({
      where: { brand_id: brandId },
      orderBy: { total_ggr: "desc" },
      take: topLimit,
      select: rollupSelect,
    }),
  ]);

  // Latest rollup timestamp across all returned rows (for freshness indicator)
  const allRollupRows = [...topByClicks, ...topByDeposit, ...topByGgr];
  const rollupLastUpdated =
    allRollupRows.length > 0
      ? new Date(Math.max(...allRollupRows.map((r) => r.updated_at.getTime()))).toISOString()
      : null;

  return ok({
    period,
    period_start: gte.toISOString(),
    period_end: lt.toISOString(),
    top_limit: topLimit,
    operational: {
      generated,
      approved,
      rejected,
      published,
    },
    attribution: {
      clicks,
      signups,
      depositors: depositorGroups.length,
      total_deposit: decimalStr(depositAgg._sum.amount),
      total_ggr: decimalStr(ggrAgg._sum.ggr_amount),
    },
    top_by_clicks: topByClicks.map(toTopPost),
    top_by_deposit: topByDeposit.map(toTopPost),
    top_by_ggr: topByGgr.map(toTopPost),
    rollup_last_updated: rollupLastUpdated,
  });
}
