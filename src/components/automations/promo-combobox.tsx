"use client";

// Searchable Combobox for picking a promotion (Promo ID / Promo Name).
// Used by Automation Rules → On Going Promotions tab. Two instances
// per rule: one in `mode="id"`, one in `mode="name"`. Both share the
// same options list and onChange so selecting from either field
// auto-populates both `promo_id` and `promo_name` on the saved rule.
//
// Built on a plain button + absolute panel + outside-click handler
// (NOT Base UI) — same hazard avoidance as src/components/layout/topbar.tsx
// (BrandSwitcher / UserMenu). Selecting from a Base UI menu while the
// parent re-renders / invalidates queries triggers Base UI error #31.

import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronDown, Search, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PromoOption {
  promo_id: string;
  promo_name: string;
}

export interface PromoComboboxProps {
  /** Determines which value the trigger displays. Both modes show the
   *  same panel + filter the same way. */
  mode: "id" | "name";
  options: PromoOption[];
  /** Current rule state. Both fields surface here regardless of mode. */
  value: PromoOption;
  onChange: (next: PromoOption) => void;
  loading?: boolean;
  /** Human-readable error to render in the panel. Falsy when clean. */
  error?: string | null;
  /** Optional retry handler — when present, the panel error state shows
   *  a Retry button. */
  onRetry?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function PromoCombobox({
  mode,
  options,
  value,
  onChange,
  loading,
  error,
  onRetry,
  disabled,
  placeholder,
}: PromoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Outside click closes the panel.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Auto-focus the search input when the panel opens.
  useEffect(() => {
    if (open) {
      // microtask delay so the input exists in the DOM
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setFilter("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.promo_id.toLowerCase().includes(q) ||
        o.promo_name.toLowerCase().includes(q),
    );
  }, [options, filter]);

  const triggerLabel = (() => {
    if (mode === "id") return value.promo_id || placeholder || "Select promo";
    return value.promo_name || placeholder || "Select promotion";
  })();

  const triggerEmpty =
    mode === "id" ? !value.promo_id : !value.promo_name;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          triggerEmpty && "text-muted-foreground",
        )}
      >
        <span className={cn("truncate text-left", mode === "id" && "font-mono text-[13px]")}>
          {triggerLabel}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-md">
          {/* Search */}
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by id or name…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Body */}
          <div className="max-h-72 overflow-y-auto p-1">
            {loading && (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading promotions…
              </div>
            )}

            {!loading && error && (
              <div className="px-2 py-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => {
                      onRetry();
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {options.length === 0
                  ? "No active promotions available"
                  : "No matching promotions"}
              </p>
            )}

            {!loading && !error && filtered.length > 0 && (
              <ul className="space-y-0.5">
                {filtered.map((o) => {
                  const selected =
                    o.promo_id === value.promo_id && o.promo_name === value.promo_name;
                  return (
                    <li key={o.promo_id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(o);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
                          selected && "bg-muted",
                        )}
                      >
                        <span className="text-sm font-medium leading-snug">
                          {o.promo_name}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground leading-tight">
                          {o.promo_id}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
