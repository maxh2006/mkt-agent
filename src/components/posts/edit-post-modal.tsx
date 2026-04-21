"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock } from "lucide-react";
import { postsApi, type Post, type EventBriefContext } from "@/lib/posts-api";

interface EditPostModalProps {
  post: Post | null;
  open: boolean;
  onClose: () => void;
}

interface ContentSection { label: string; value: string; }

function buildContentSections(post: Post): ContentSection[] {
  const sections: ContentSection[] = [];
  if (post.headline)    sections.push({ label: "Headline",    value: post.headline });
  if (post.caption)     sections.push({ label: "Caption",     value: post.caption });
  if (post.cta)         sections.push({ label: "CTA",         value: post.cta });
  if (post.banner_text) sections.push({ label: "Banner Text", value: post.banner_text });
  if (post.image_prompt)sections.push({ label: "Image Prompt",value: post.image_prompt });
  return sections;
}

const SOURCE_LABELS: Record<string, string> = {
  event: "Event",
  hot_games: "Hot Games",
  big_win: "Big Win",
  promo: "Running Promotion",
  manual: "Manual",
};

function sourceReminder(sourceType: string | null): string | null {
  if (sourceType === "event") return "Event rules and posting instance remain fixed.";
  if (sourceType === "hot_games") return "The original frozen snapshot will be reused.";
  if (sourceType === "big_win") return "Rule-matched values and username logic remain fixed.";
  if (sourceType === "promo") return "Source promotion config remains fixed.";
  return null;
}

export function EditPostModal({ post, open, onClose }: EditPostModalProps) {
  const [instruction, setInstruction] = useState("");
  const [applied, setApplied] = useState(false);
  const [eventContext, setEventContext] = useState<EventBriefContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const isEventDerived = post?.source_type === "event" && !!post?.source_id;
  const hotGamesCtx = (() => {
    const ctx = post?.generation_context_json as Record<string, unknown> | null | undefined;
    if (!ctx || ctx.type !== "hot_games_snapshot") return null;
    return {
      scanAt: ctx.scan_timestamp as string | undefined,
      sourceWindow: ctx.source_window_minutes as number | undefined,
      gamesCount: ((ctx.ranked_games as Array<unknown> | undefined) ?? []).length,
    };
  })();

  useEffect(() => {
    if (open && isEventDerived && post) {
      setLoadingContext(true);
      postsApi.getEventContext(post.id)
        .then((ctx) => setEventContext(ctx))
        .catch(() => setEventContext(null))
        .finally(() => setLoadingContext(false));
    } else {
      setEventContext(null);
    }
  }, [open, isEventDerived, post?.id]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setInstruction("");
      setApplied(false);
      setEventContext(null);
      onClose();
    }
  }

  function handleApply() {
    setApplied(true);
  }

  if (!post) return null;

  const sections = buildContentSections(post);
  const sourceLabel = post.source_type ? (SOURCE_LABELS[post.source_type] ?? post.source_type) : null;
  const reminder = sourceReminder(post.source_type);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Refine Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Locked Context panel — always shown when there's a source */}
          {post.source_type && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 text-sm space-y-1">
                  <p className="font-medium">Locked Context</p>

                  <div className="grid grid-cols-[90px_1fr] gap-x-2 text-xs">
                    {sourceLabel && (
                      <>
                        <span className="text-muted-foreground">Source</span>
                        <span>{sourceLabel}</span>
                      </>
                    )}

                    {isEventDerived && (
                      <>
                        <span className="text-muted-foreground">Event</span>
                        <span>
                          {loadingContext ? "Loading…" : (eventContext?.event_title ?? "—")}
                        </span>
                      </>
                    )}

                    {post.schedule_summary && (
                      <>
                        <span className="text-muted-foreground">Schedule</span>
                        <span>{post.schedule_summary}</span>
                      </>
                    )}

                    {hotGamesCtx && (
                      <>
                        <span className="text-muted-foreground">Snapshot</span>
                        <span>
                          {hotGamesCtx.scanAt && new Date(hotGamesCtx.scanAt).toLocaleString()}
                          {hotGamesCtx.sourceWindow && ` • ${hotGamesCtx.sourceWindow} min`}
                          {hotGamesCtx.gamesCount > 0 && ` • ${hotGamesCtx.gamesCount} games`}
                        </span>
                      </>
                    )}
                  </div>

                  {reminder && (
                    <p className="text-xs text-muted-foreground">{reminder}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Current content preview */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current Content
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3">
              {sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">(no content)</p>
              ) : (
                sections.map(({ label, value }) => (
                  <div key={label}>
                    <span className="text-xs font-medium text-muted-foreground">{label}: </span>
                    <span className="text-sm">{value}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Refinement instruction input */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Refinement Instruction
            </label>
            <textarea
              value={instruction}
              onChange={(e) => { setInstruction(e.target.value); setApplied(false); }}
              placeholder="e.g. Make the tone more exciting, add urgency to the CTA, shorten the caption to 2 lines..."
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              You may refine visual style, tone, and presentation. Fixed rules, reward, timing, and source context will remain unchanged.
            </p>
          </div>

          {applied && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              AI refinement is not yet available. Your instruction has been noted and will be
              applied when the AI generation step is implemented.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleApply} disabled={!instruction.trim() || applied} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Apply Refinement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
