// Client-side fetch helpers for the insights API.
// All functions throw on non-OK responses so TanStack Query surfaces them as errors.

export type InsightsPeriod = "today" | "last_7_days" | "last_30_days";

export interface TopPost {
  post_id: string;
  headline: string | null;
  platform: string;
  post_type: string;
  clicks: number;
  total_deposit: string;
  total_ggr: string;
  rollup_updated_at: string;
}

export interface InsightsData {
  period: InsightsPeriod;
  period_start: string;
  period_end: string;
  top_limit: number;
  operational: {
    generated: number;
    approved: number;
    rejected: number;
    published: number;
  };
  attribution: {
    clicks: number;
    signups: number;
    depositors: number;
    total_deposit: string;
    total_ggr: string;
  };
  top_by_clicks: TopPost[];
  top_by_deposit: TopPost[];
  top_by_ggr: TopPost[];
  /** ISO string of the most recently updated rollup row, or null if no data. */
  rollup_last_updated: string | null;
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const insightsApi = {
  get: (period: InsightsPeriod) =>
    apiFetch<InsightsData>(`/api/insights?period=${period}`),
};
