"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { eventsApi, type Event, type EventFilters } from "@/lib/events-api";
import { useActiveBrand } from "@/lib/active-brand-client";
import { EVENT_TYPES, EVENT_STATUSES, EVENT_TYPE_LABELS } from "@/lib/validations/event";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  ended: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted/50 text-muted-foreground/60 border-border",
};


function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_COLORS[status] ?? "bg-muted text-muted-foreground border-border")}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

const PER_PAGE = 25;

export default function EventsPage() {
  const router = useRouter();
  const { isAllBrands } = useActiveBrand();
  const [filters, setFilters] = useState<EventFilters>({ page: 1, per_page: PER_PAGE });
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["events", filters],
    queryFn: () => eventsApi.list(filters),
    retry: false,
  });

  function setFilter(key: keyof EventFilters, value: string | number | undefined) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchInput.trim() || undefined, page: 1 }));
  }

  function setPage(page: number) {
    setFilters((prev) => ({ ...prev, page }));
  }

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;
  const currentPage = filters.page ?? 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage adhoc campaigns and seasonal activities.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => router.push("/events/new")}
          disabled={isAllBrands}
          title={isAllBrands ? "Select a specific brand to create an event" : undefined}
        >
          <Plus className="h-4 w-4" />
          New Event
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submitSearch} className="flex gap-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search events…"
              className="h-7 w-52 rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
          {filters.search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                setFilters((prev) => ({ ...prev, search: undefined, page: 1 }));
              }}
            >
              Clear
            </Button>
          )}
        </form>

        <Select
          value={filters.status ?? ""}
          onValueChange={(v) => setFilter("status", v ?? "")}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            {EVENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.event_type ?? ""}
          onValueChange={(v) => setFilter("event_type", v ?? "")}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {EVENT_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* States */}
      {isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load events"}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">Loading events…</p>
        </div>
      )}

      {/* Table */}
      {data && !isError && (
        <>
          {data.events.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No events match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Title</th>
                    {isAllBrands && <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Brand</th>}
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date Range</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.events.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      isAllBrands={isAllBrands}
                      onView={() => router.push(`/events/${event.id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {data.total} event{data.total !== 1 ? "s" : ""} — page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EventRow({ event, isAllBrands, onView }: { event: Event; isAllBrands: boolean; onView: () => void }) {
  return (
    <tr
      className="hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onView}
    >
      <td className="px-4 py-3 max-w-xs">
        <p className="truncate font-medium">{event.title}</p>
        {event.objective && (
          <p className="text-xs text-muted-foreground truncate">{event.objective}</p>
        )}
      </td>
      {isAllBrands && (
        <td className="px-4 py-3 text-muted-foreground">{event.brand?.name ?? "—"}</td>
      )}
      <td className="px-4 py-3 text-muted-foreground">
        {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={event.status} />
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
        {formatDateRange(event.start_at, event.end_at)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {event.creator?.name ?? "—"}
      </td>
    </tr>
  );
}
