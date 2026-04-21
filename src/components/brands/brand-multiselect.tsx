"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandOption {
  id: string;
  name: string;
}

interface BrandMultiselectProps {
  brands: BrandOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Filter-side brand multi-select.
 *
 * - Default visible state is "All Brands" (selected.length === 0).
 * - "All Brands" row clears the selection.
 * - Each brand row toggles membership in `selected`.
 * - Behaves as a filter: an empty array means "no filter applied"
 *   (show all), not "show none".
 */
export function BrandMultiselect({
  brands,
  selected,
  onChange,
  disabled,
  className,
}: BrandMultiselectProps) {
  const allSelected = selected.length === 0;
  const triggerLabel = allSelected
    ? "All Brands"
    : selected.length === 1
      ? brands.find((b) => b.id === selected[0])?.name ?? "1 brand"
      : `${selected.length} brands`;

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "min-w-[180px] justify-between gap-2",
          className,
        )}
      >
        <span className="truncate">Brand: {triggerLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[220px] max-h-[320px] overflow-y-auto">
        <DropdownMenuCheckboxItem
          checked={allSelected}
          onCheckedChange={() => onChange([])}
          onSelect={(e) => e.preventDefault()}
        >
          All Brands
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {brands.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No brands available
          </div>
        ) : (
          brands.map((b) => (
            <DropdownMenuCheckboxItem
              key={b.id}
              checked={selected.includes(b.id)}
              onCheckedChange={() => toggle(b.id)}
              onSelect={(e) => e.preventDefault()}
            >
              {b.name}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
