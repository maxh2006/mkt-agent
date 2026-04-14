"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { insightsApi, type InsightsPeriod, type TopPost } from "@/lib/insights-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Period config ────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<InsightsPeriod, string> = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
};

// ─── Number formatters ────────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function fmtCurrency(s: string): string {
  const n = parseFloat(s);
  if (isNaN(n)) return "₱0.00";
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MetricCardSkeleton() {
  return <div className="rounded-xl border border-border bg-card h-24 animate-pulse" />;
}

// ─── Top content table ────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter / X",
  tiktok: "TikTok",
  telegram: "Telegram",
};

const POST_TYPE_LABELS: Record<string, string> = {
  promo: "Promo",
  big_win: "Big Win",
  event: "Event",
  educational: "Educational",
};

function TopPostsTable({
  title,
  rows,
  metric,
  metricLabel,
  format,
}: {
  title: string;
  rows: TopPost[];
  metric: keyof TopPost;
  metricLabel: string;
  format: (v: string | number) => string;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No data yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Post</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Platform</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                {metricLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.post_id} className={i < rows.length - 1 ? "border-b border-border" : ""}>
                <td className="px-4 py-2.5 max-w-xs">
                  <span className="truncate block text-sm">
                    {row.headline ?? (
                      <span className="text-muted-foreground italic">No headline</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {PLATFORM_LABELS[row.platform] ?? row.platform}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {POST_TYPE_LABELS[row.post_type] ?? row.post_type}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {format(row[metric] as string | number)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [period, setPeriod] = useState<InsightsPeriod>("last_7_days");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["insights", period],
    queryFn: () => insightsApi.get(period),
    retry: false,
  });

  const isNoBrand =
    isError && error instanceof Error && error.message.includes("No active brand");

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational metrics and link attribution for this brand.
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as InsightsPeriod)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as InsightsPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PERIOD_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* No active brand */}
      {isNoBrand && (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium">No active brand selected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the brand switcher in the top bar to select a brand.
          </p>
        </div>
      )}

      {/* Generic error */}
      {isError && !isNoBrand && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load insights"}
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Operational
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <MetricCardSkeleton key={i} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Attribution
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <MetricCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Data */}
      {data && !isError && (
        <div className="space-y-8">
          {/* Operational metrics */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Operational — {PERIOD_LABELS[data.period]}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard label="Posts Generated" value={fmtInt(data.operational.generated)} />
              <MetricCard label="Posts Approved" value={fmtInt(data.operational.approved)} />
              <MetricCard label="Posts Rejected" value={fmtInt(data.operational.rejected)} />
              <MetricCard label="Posts Published" value={fmtInt(data.operational.published)} />
            </div>
          </section>

          {/* Attribution metrics */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Attribution — {PERIOD_LABELS[data.period]}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <MetricCard
                label="Clicks"
                value={fmtInt(data.attribution.clicks)}
                sub="From tracked links"
              />
              <MetricCard
                label="Signups"
                value={fmtInt(data.attribution.signups)}
                sub="New registrations"
              />
              <MetricCard
                label="Depositors"
                value={fmtInt(data.attribution.depositors)}
                sub="Unique depositing users"
              />
              <MetricCard
                label="Total Deposit"
                value={fmtCurrency(data.attribution.total_deposit)}
                sub="Successful deposits only"
              />
              <MetricCard
                label="Total GGR"
                value={fmtCurrency(data.attribution.total_ggr)}
                sub="Gross gaming revenue"
              />
            </div>
          </section>

          {/* Top content */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Top Content — All-time (cumulative)
              </p>
              {data.rollup_last_updated ? (
                <p className="text-xs text-muted-foreground">
                  Last updated: {fmtDatetime(data.rollup_last_updated)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No rollup data yet</p>
              )}
            </div>
            <div className="space-y-6">
              <TopPostsTable
                title="Top Posts by Clicks"
                rows={data.top_by_clicks}
                metric="clicks"
                metricLabel="Clicks"
                format={(v) => fmtInt(v as number)}
              />
              <TopPostsTable
                title="Top Posts by Deposit"
                rows={data.top_by_deposit}
                metric="total_deposit"
                metricLabel="Total Deposit"
                format={(v) => fmtCurrency(v as string)}
              />
              <TopPostsTable
                title="Top Posts by GGR"
                rows={data.top_by_ggr}
                metric="total_ggr"
                metricLabel="Total GGR"
                format={(v) => fmtCurrency(v as string)}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
