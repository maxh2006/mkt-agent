"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2, CircleDot } from "lucide-react";
import { postsApi, type PlatformDelivery } from "@/lib/posts-api";
import { cn } from "@/lib/utils";

interface DeliveryStatusModalProps {
  postId: string | null;
  open: boolean;
  onClose: () => void;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
  queued:     { label: "Queued",     className: "bg-muted text-muted-foreground border-border",                   Icon: Clock },
  scheduled:  { label: "Scheduled",  className: "bg-blue-500/10 text-blue-700 border-blue-500/20",                Icon: Clock },
  publishing: { label: "Publishing", className: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",                Icon: Loader2 },
  posted:     { label: "Posted",     className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",       Icon: CheckCircle2 },
  failed:     { label: "Failed",     className: "bg-destructive/10 text-destructive border-destructive/20",        Icon: AlertCircle },
};

function DeliveryStatusChip({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "bg-muted text-muted-foreground border-border", Icon: CircleDot };
  const { Icon } = meta;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium", meta.className)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function DeliveryStatusModal({ postId, open, onClose }: DeliveryStatusModalProps) {
  const [deliveries, setDeliveries] = useState<PlatformDelivery[]>([]);
  const [targetPlatform, setTargetPlatform] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await postsApi.getDeliveries(postId);
      setDeliveries(res.deliveries);
      setTargetPlatform(res.post.platform);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && postId) load();
    else {
      setDeliveries([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  async function retry(platform: string) {
    if (!postId) return;
    setRetrying(platform);
    setError(null);
    try {
      await postsApi.retryDelivery(postId, platform);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(null);
    }
  }

  async function retryAllFailed() {
    if (!postId) return;
    const failed = deliveries.filter((d) => d.status === "failed");
    for (const d of failed) {
      setRetrying(d.platform);
      try { await postsApi.retryDelivery(postId, d.platform); }
      catch (err) {
        setError(err instanceof Error ? err.message : "Retry failed");
        break;
      }
    }
    setRetrying(null);
    await load();
  }

  const anyFailed = deliveries.some((d) => d.status === "failed");
  const hasRows = deliveries.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : !hasRows ? (
            <div className="rounded-md border bg-muted/20 px-4 py-6 text-center space-y-1">
              <p className="text-sm text-muted-foreground">No delivery records yet.</p>
              <p className="text-xs text-muted-foreground/80">
                {targetPlatform
                  ? `This post targets ${targetPlatform}. Delivery rows are created at approval; this post has not been approved yet.`
                  : "Delivery rows are created at approval; this post has not been approved yet."}
              </p>
            </div>
          ) : (
            <>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Platform</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Scheduled</th>
                    <th className="px-3 py-2 font-medium">Attempted</th>
                    <th className="px-3 py-2 font-medium">Posted / Error</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="align-top">
                      <td className="px-3 py-2 font-medium capitalize">{d.platform}</td>
                      <td className="px-3 py-2"><DeliveryStatusChip status={d.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(d.scheduled_for)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmt(d.publish_attempted_at)}</td>
                      <td className="px-3 py-2 text-xs">
                        {d.status === "posted" ? (
                          <div className="space-y-0.5">
                            <div className="text-muted-foreground">{fmt(d.posted_at)}</div>
                            {d.external_post_id && (
                              <div className="font-mono text-[10px] text-muted-foreground/70">{d.external_post_id}</div>
                            )}
                          </div>
                        ) : d.status === "failed" ? (
                          <div className="space-y-0.5">
                            <div className="text-destructive">{d.last_error ?? "Unknown error"}</div>
                            <div className="text-[10px] text-muted-foreground">Retries: {d.retry_count}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {d.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retry(d.platform)}
                            disabled={retrying !== null}
                            className="gap-1 h-7"
                          >
                            <RefreshCw className={cn("h-3 w-3", retrying === d.platform && "animate-spin")} />
                            Retry
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {anyFailed && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Retry resends the same approved content to the failed platform.
                It does not regenerate content or require re-approval. Manus
                reattempts on the next dispatcher tick.
              </p>
            )}
            </>
          )}
        </div>

        <DialogFooter>
          {anyFailed && deliveries.filter((d) => d.status === "failed").length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={retryAllFailed}
              disabled={retrying !== null}
              className="gap-1"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", retrying !== null && "animate-spin")} />
              Retry All Failed
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
