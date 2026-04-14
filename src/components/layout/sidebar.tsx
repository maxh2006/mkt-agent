"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  CalendarDays,
  Zap,
  SlidersHorizontal,
  Layers,
  BarChart2,
  Radio,
  Settings2,
  Users,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview",           href: "/",                icon: LayoutDashboard },
  { label: "Content Queue",      href: "/queue",           icon: ListOrdered },
  { label: "Calendar",           href: "/calendar",        icon: CalendarDays },
  { label: "Events",             href: "/events",          icon: Zap },
  { label: "Automations",        href: "/automations",     icon: SlidersHorizontal },
  { label: "Templates & Assets", href: "/templates",       icon: Layers },
  { label: "Insights",           href: "/insights",        icon: BarChart2 },
  { label: "Channels",           href: "/channels",        icon: Radio },
  { label: "Brand Management",    href: "/brands",           icon: Settings2 },
  { label: "Users & Roles",      href: "/users",           icon: Users },
  { label: "Audit Logs",         href: "/audit-logs",      icon: ScrollText },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-background">
      <nav className="flex flex-col gap-1 p-3 pt-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
