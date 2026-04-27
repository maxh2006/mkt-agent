"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, Bell, User, Check, Layers, Menu, LogOut } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { brandsApi, type Brand } from "@/lib/brands-api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveBrandState {
  mode: "single" | "all";
  brand: { id: string; name: string; primary_color: string | null } | null;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchActiveBrand(): Promise<ActiveBrandState | null> {
  const res = await fetch("/api/brands/active", { credentials: "include" });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data as ActiveBrandState | null) ?? null;
}

// ─── Custom brand switcher (no Base UI — avoids error #31) ───────────────────

interface BrandSwitcherProps {
  brands: Brand[] | undefined;
  activeBrandState: ActiveBrandState | null | undefined;
  activeBrandLoading: boolean;
  onSwitch: (brandId: string) => Promise<void>;
}

function BrandSwitcher({
  brands,
  activeBrandState,
  activeBrandLoading,
  onSwitch,
}: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAllBrands = activeBrandState?.mode === "all";
  const activeBrand = activeBrandState?.brand ?? null;

  const buttonLabel = activeBrandLoading
    ? "Loading..."
    : isAllBrands
    ? "All Brands"
    : activeBrand?.name ?? "Select Brand";

  // Close on outside click
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

  async function handleSelect(brandId: string) {
    setOpen(false);
    await onSwitch(brandId);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-2 max-w-[220px]"
        )}
      >
        {/* Icon */}
        {isAllBrands ? (
          <Layers className="h-4 w-4 shrink-0" />
        ) : activeBrand?.primary_color ? (
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
            style={{ backgroundColor: activeBrand.primary_color }}
          />
        ) : (
          <Building2 className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 w-56 -translate-x-1/2 rounded-lg border bg-popover p-1 shadow-md">
          <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Switch Brand
          </p>
          <div className="my-1 h-px bg-border" />

          {/* All Brands */}
          <button
            type="button"
            onClick={() => handleSelect("all")}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
              isAllBrands && "bg-muted font-medium"
            )}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">All Brands</span>
            {isAllBrands && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>

          <div className="my-1 h-px bg-border" />

          {/* Brand list */}
          {!brands || brands.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No brands available</p>
          ) : (
            brands.map((brand) => {
              const isActive = !isAllBrands && brand.id === activeBrand?.id;
              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => handleSelect(brand.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                    isActive && "bg-muted font-medium"
                  )}
                >
                  {brand.primary_color ? (
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                      style={{ backgroundColor: brand.primary_color }}
                    />
                  ) : (
                    <span className="inline-block h-2.5 w-2.5 shrink-0" />
                  )}
                  <span className="flex-1 truncate text-left">{brand.name}</span>
                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Custom user menu (no Base UI — avoids error #31 on signOut) ─────────────
//
// Same hazard as the BrandSwitcher rebuild (commit fffd69b): Base UI's
// DropdownMenu throws "error #31" when something unmounts the menu's
// React-context provider mid-exit-animation. signOut() triggers a
// session-state change that does exactly that. Plain button + absolute
// panel + outside-click handler keeps Base UI off the signOut path.

function UserMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  function handleSignOut() {
    setOpen(false);
    // Defer one tick so the panel's unmount happens before next-auth's
    // session-state churn — same defensive ordering the brand switcher
    // uses around invalidateQueries.
    setTimeout(() => {
      signOut({ callbackUrl: "/login" });
    }, 0);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "rounded-full"
        )}
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-md">
          <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
            {displayName}
          </p>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { data: session } = useSession();

  const queryClient = useQueryClient();
  const autoSelectedRef = useRef(false);

  // Current active brand state (from cookie via API)
  const { data: activeBrandState, isLoading: activeBrandLoading } = useQuery({
    queryKey: ["active-brand"],
    queryFn: fetchActiveBrand,
    staleTime: 30_000,
  });

  // All accessible active brands for this user
  const { data: brands } = useQuery({
    queryKey: ["brands-switcher"],
    queryFn: () => brandsApi.list({ active: "true" }),
    staleTime: 60_000,
  });

  // ── Auto-select single brand (only if exactly 1 brand and no active state yet) ──
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (!brands || activeBrandLoading) return;
    if (activeBrandState) return;
    if (brands.length === 1) {
      autoSelectedRef.current = true;
      switchBrand(brands[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands, activeBrandState, activeBrandLoading]);

  // ── Handle active brand becoming inactive / removed ───────────────────────
  useEffect(() => {
    if (!brands || !activeBrandState || activeBrandState.mode === "all") return;
    const stillActive = brands.some((b) => b.id === activeBrandState.brand?.id);
    if (!stillActive && brands.length > 0) {
      switchBrand(brands[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands, activeBrandState]);

  // ── Switch brand (no Base UI involved — safe to invalidate immediately) ────
  async function switchBrand(brandId: string) {
    const res = await fetch("/api/brands/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: brandId }),
    });
    if (!res.ok) return;
    queryClient.invalidateQueries({ queryKey: ["active-brand"] });
    queryClient.invalidateQueries();
  }

  const displayName = session?.user?.name ?? session?.user?.email ?? "Account";

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Mobile hamburger + Logo */}
      <div className="flex items-center gap-2">
        <button
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")}
          aria-label="Toggle menu"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-base font-semibold tracking-tight">MKT Agent</span>
      </div>

      {/* Brand Switcher — custom, no Base UI */}
      <BrandSwitcher
        brands={brands}
        activeBrandState={activeBrandState}
        activeBrandLoading={activeBrandLoading}
        onSwitch={switchBrand}
      />

      {/* Notifications + User Menu */}
      <div className="flex items-center gap-2">
        <button
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        <UserMenu displayName={displayName} />
      </div>
    </header>
  );
}
