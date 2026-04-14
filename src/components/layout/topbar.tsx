"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, Bell, User, AlertCircle } from "lucide-react";
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

export function TopBar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Fetch brands accessible to the current user
  const { data: brands } = useQuery({
    queryKey: ["brands-switcher"],
    queryFn: () => brandsApi.list({ active: "true" }),
    staleTime: 60_000,
  });

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
      router.refresh();
    } catch {
      setSwitchError("Could not switch brand");
    }
  }

  const displayName = session?.user?.name ?? session?.user?.email ?? "Account";

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      {/* Logo */}
      <span className="text-base font-semibold tracking-tight">MKT Agent</span>

      {/* Brand Switcher */}
      <DropdownMenu onOpenChange={() => setSwitchError(null)}>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-2",
            switchError && "border-destructive text-destructive"
          )}
        >
          {switchError ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          <span>Select Brand</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-52">
          <DropdownMenuLabel>Switch Brand</DropdownMenuLabel>
          {switchError && (
            <p className="px-2 pb-1 text-xs text-destructive">{switchError}</p>
          )}
          <DropdownMenuSeparator />
          {!brands || brands.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No brands available</p>
          ) : (
            brands.map((brand) => (
              <DropdownMenuItem
                key={brand.id}
                onClick={() => switchBrand(brand.id)}
              >
                {/* Color dot */}
                {brand.primary_color && (
                  <span
                    className="mr-2 inline-block h-2.5 w-2.5 rounded-full shrink-0 border"
                    style={{ backgroundColor: brand.primary_color }}
                  />
                )}
                <span className="truncate">{brand.name}</span>
              </DropdownMenuItem>
            ))
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
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full")}
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
