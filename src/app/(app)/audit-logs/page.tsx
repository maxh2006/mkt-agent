"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditLogsApi, type AuditLogEntry } from "@/lib/audit-logs-api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Filter config ────────────────────────────────────────────────────────────

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "All entity types" },
  { value: "post", label: "Post" },
  { value: "event", label: "Event" },
  { value: "automation_rule", label: "Automation Rule" },
  { value: "channel", label: "Channel" },
  { value: "template", label: "Template" },
  { value: "brand", label: "Brand" },
];

// Group actions by domain for the select — value is the exact action string
const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  // Posts
  { value: "post.created", label: "Post: Created" },
  { value: "post.updated", label: "Post: Updated" },
  { value: "post.approved", label: "Post: Approved" },
  { value: "post.rejected", label: "Post: Rejected" },
  { value: "post.scheduled", label: "Post: Scheduled" },
  { value: "post.published", label: "Post: Published" },
  // Events
  { value: "event.created", label: "Event: Created" },
  { value: "event.updated", label: "Event: Updated" },
  { value: "event.status_changed", label: "Event: Status Changed" },
  // Automations
  { value: "automation.created", label: "Automation: Created" },
  { value: "automation.updated", label: "Automation: Updated" },
  { value: "automation.value_display_changed", label: "Automation: Value Display Changed" },
  // Channels
  { value: "channel.created", label: "Channel: Created" },
  { value: "channel.updated", label: "Channel: Updated" },
  { value: "channel.status_changed", label: "Channel: Status Changed" },
  // Templates
  { value: "template.created", label: "Template: Created" },
  { value: "template.updated", label: "Template: Updated" },
  { value: "template.toggled", label: "Template: Toggled" },
  // Settings
  { value: "brand_settings.updated", label: "Brand Settings: Updated" },
  // Auth
  { value: "login", label: "Auth: Login" },
  { value: "logout", label: "Auth: Logout" },
];

const PER_PAGE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionBadgeClass(action: string): string {
  if (action.includes("created")) return "bg-green-50 text-green-700 border-green-200";
  if (action.includes("approved")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (action.includes("rejected")) return "bg-red-50 text-red-700 border-red-200";
  if (action.includes("updated") || action.includes("changed")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (action.includes("toggled")) return "bg-purple-50 text-purple-700 border-purple-200";
  if (action.includes("scheduled") || action.includes("published")) return "bg-teal-50 text-teal-700 border-teal-200";
  if (action === "login" || action === "logout") return "bg-gray-50 text-gray-600 border-gray-200";
  return "bg-muted text-muted-foreground border-border";
}

// ─── Detail expandable row ────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.before_json !== null || entry.after_json !== null;

  return (
    <>
      <tr
        className={`border-b border-border text-sm ${hasDetail ? "cursor-pointer hover:bg-muted/30" : ""}`}
        onClick={() => hasDetail && setExpanded((e) => !e)}
      >
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {fmtDatetime(entry.created_at)}
        </td>
        <td className="px-4 py-3 text-xs max-w-[140px] truncate">
          {entry.user.name || entry.user.email}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${actionBadgeClass(entry.action)}`}
          >
            {entry.action}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{entry.entity_type}</td>
        <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-[120px] truncate">
          {entry.entity_id}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {hasDetail && (
            <span className="text-primary">{expanded ? "▲ Hide" : "▼ Details"}</span>
          )}
        </td>
      </tr>
      {expanded && hasDetail && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs font-mono">
              {entry.before_json !== null && (
                <div>
                  <p className="font-sans font-medium text-muted-foreground mb-1">Before</p>
                  <pre className="whitespace-pre-wrap break-all text-muted-foreground bg-muted/40 rounded p-2 max-h-40 overflow-y-auto">
                    {JSON.stringify(entry.before_json, null, 2)}
                  </pre>
                </div>
              )}
              {entry.after_json !== null && (
                <div>
                  <p className="font-sans font-medium text-muted-foreground mb-1">After</p>
                  <pre className="whitespace-pre-wrap break-all text-muted-foreground bg-muted/40 rounded p-2 max-h-40 overflow-y-auto">
                    {JSON.stringify(entry.after_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface Filters {
  action: string;
  entity_type: string;
  date_from: string;
  date_to: string;
}

const EMPTY_FILTERS: Filters = { action: "", entity_type: "", date_from: "", date_to: "" };

export default function AuditLogsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  function setFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function applyFilters() {
    setApplied(filters);
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  const hasActiveFilters = Object.values(applied).some((v) => v !== "");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["audit-logs", applied, page],
    queryFn: () =>
      auditLogsApi.list({
        action: applied.action || undefined,
        entity_type: applied.entity_type || undefined,
        date_from: applied.date_from || undefined,
        date_to: applied.date_to || undefined,
        page,
        per_page: PER_PAGE,
      }),
    retry: false,
  });

  const isNoBrand =
    isError && error instanceof Error && error.message.includes("No active brand");

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 0;

  const inputClass =
    "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A record of all critical changes for the active brand.
        </p>
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
            {error instanceof Error ? error.message : "Failed to load audit logs"}
          </p>
        </div>
      )}

      {!isError && (
        <>
          {/* Filters */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                value={filters.action}
                onValueChange={(v) => setFilter("action", !v || v === "__all__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value || "__all__"} value={o.value !== "" ? o.value : "__all__"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.entity_type}
                onValueChange={(v) => setFilter("entity_type", !v || v === "__all__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All entity types" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value || "__all__"} value={o.value !== "" ? o.value : "__all__"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilter("date_from", e.target.value)}
                placeholder="From date"
                className={inputClass}
              />
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilter("date_to", e.target.value)}
                placeholder="To date"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={applyFilters}>
                Apply
              </Button>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              )}
              {data && (
                <span className="ml-auto text-xs text-muted-foreground self-center">
                  {data.total.toLocaleString()} {data.total === 1 ? "entry" : "entries"}
                </span>
              )}
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="rounded-xl border border-border overflow-hidden">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 border-b border-border bg-card animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && data && data.entries.length === 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-6 py-12 text-center">
              <p className="text-sm font-medium">No audit log entries found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Try adjusting or clearing the filters."
                  : "Actions on this brand will appear here as they happen."}
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && data && data.entries.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Timestamp
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      User
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      Action
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      Entity
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      ID
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-20" />
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
