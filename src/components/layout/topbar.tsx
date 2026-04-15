"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, Bell, User, AlertCircle, Check, Layers, Menu } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { brandsApi } from "@/lib/brands-api";
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

// ─── Component ────────────────────────────────────────────────────────────────

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { data: session } = useSession();

  const queryClient = useQueryClient();
  const [switchError, setSwitchError] = useState<string | null>(null);
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
    if (activeBrandState) return; // already has a state
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

  // ── Switch brand (accepts a brand id or "all") ────────────────────────────
  async function switchBrand(brandId: string) {
    setSwitchError(null);
    try {
      const res = await fetch("/api/brands/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSwitchError(json.error ?? "Could not switch brand");
        return;
      }
      // Defer invalidation so the dropdown finishes closing before React re-renders.
      // Calling invalidateQueries() synchronously while the dropdown is still in its
      // closing animation unmounts Base UI's context and throws error #31.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["active-brand"] });
        queryClient.invalidateQueries();
      }, 50);
    } catch {
      setSwitchError("Could not switch brand");
    }
  }

  const displayName = session?.user?.name ?? session?.user?.email ?? "Account";
  const isAllBrands = activeBrandState?.mode === "all";
  const activeBrand = activeBrandState?.brand ?? null;

  // Button label and icon
  const buttonLabel = activeBrandLoading
    ? "Loading..."
    : isAllBrands
    ? "All Brands"
    : activeBrand?.name ?? "Select Brand";

  const buttonIcon = switchError ? (
    <AlertCircle className="h-4 w-4 shrink-0" />
  ) : isAllBrands ? (
    <Layers className="h-4 w-4 shrink-0" />
  ) : activeBrand?.primary_color ? (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
      style={{ backgroundColor: activeBrand.primary_color }}
    />
  ) : (
    <Building2 className="h-4 w-4 shrink-0" />
  );

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

      {/* Brand Switcher */}
      <DropdownMenu onOpenChange={() => setSwitchError(null)}>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-2 max-w-[220px]",
            switchError && "border-destructive text-destructive"
          )}
        >
          {buttonIcon}
          <span className="truncate">{buttonLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="center" className="w-56">
          <DropdownMenuLabel>Switch Brand</DropdownMenuLabel>
          {switchError && (
            <p className="px-2 pb-1 text-xs text-destructive">{switchError}</p>
          )}
          <DropdownMenuSeparator />

          {/* All Brands option */}
          <DropdownMenuItem
            onClick={() => switchBrand("all")}
            className={cn(isAllBrands && "bg-muted font-medium")}
          >
            <Layers className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">All Brands</span>
            {isAllBrands && (
              <Check className="ml-1 h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {!brands || brands.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No brands available
            </p>
          ) : (
            brands.map((brand) => {
              const isActive = !isAllBrands && brand.id === activeBrand?.id;
              return (
                <DropdownMenuItem
                  key={brand.id}
                  onClick={() => switchBrand(brand.id)}
                  className={cn(isActive && "bg-muted font-medium")}
                >
                  {brand.primary_color ? (
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                      style={{ backgroundColor: brand.primary_color }}
                    />
                  ) : (
                    <span className="mr-2 inline-block h-2.5 w-2.5 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{brand.name}</span>
                  {isActive && (
                    <Check className="ml-1 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Notifications + User Menu */}
      <div className="flex items-center gap-2">
        <button
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
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
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground text-xs">
              {displayName}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
