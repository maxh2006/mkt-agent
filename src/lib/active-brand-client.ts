"use client";

import { useQuery } from "@tanstack/react-query";

interface ActiveBrandState {
  mode: "single" | "all";
  brand: { id: string; name: string; primary_color: string | null } | null;
}

async function fetchActiveBrand(): Promise<ActiveBrandState | null> {
  const res = await fetch("/api/brands/active", { credentials: "include" });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data as ActiveBrandState | null) ?? null;
}

/**
 * Hook to read the current active brand context.
 * Shares the same query cache key as the TopBar so no extra fetch is made.
 */
export function useActiveBrand() {
  const { data, isLoading } = useQuery({
    queryKey: ["active-brand"],
    queryFn: fetchActiveBrand,
    staleTime: 30_000,
  });

  return {
    mode: data?.mode ?? null,
    brand: data?.brand ?? null,
    isAllBrands: data?.mode === "all",
    isLoading,
  };
}
