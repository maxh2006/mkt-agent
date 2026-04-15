import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FileEdit,
  Clock,
  CheckCircle2,
  CalendarClock,
  SendHorizontal,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatusConfig {
  label: string;
  className: string;
  Icon: LucideIcon;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-border",
    Icon: FileEdit,
  },
  pending_approval: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
    Icon: Clock,
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400",
    Icon: CalendarClock,
  },
  posted: {
    label: "Posted",
    className: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-400",
    Icon: SendHorizontal,
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    Icon: XCircle,
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    Icon: AlertTriangle,
  },
};

const FALLBACK: StatusConfig = {
  label: "",
  className: "bg-muted text-muted-foreground border-border",
  Icon: FileEdit,
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { ...FALLBACK, label: status };
  const { Icon } = config;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap", config.className, className)}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {config.label}
    </Badge>
  );
}
